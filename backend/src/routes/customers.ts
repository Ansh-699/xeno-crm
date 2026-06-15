import { Prisma } from "@prisma/client";
import { Router, Request, Response } from "express";
import multer from "multer";
import { parse } from "csv-parse";
import { Readable } from "stream";
import prisma from "../lib/prisma";
import { CustomerInput } from "../lib/ingest-schemas";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const CUSTOMER_FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "full_name", "customer_name", "company", "business", "business_name"],
  email: ["email", "email_address", "e_mail"],
  phone: ["phone", "mobile", "phone_number", "contact_number", "telephone"],
  city: ["city", "location", "town", "region"],
  optedOut: ["optedout", "opted_out", "unsubscribe", "marketing_opt_out", "consent"],
  attributes: ["attributes", "metadata", "meta", "details"],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function getHeaderMatch(headers: string[], aliases: string[]): string | undefined {
  const normalizedToOriginal = new Map(headers.map((header) => [normalizeHeader(header), header]));

  for (const alias of aliases) {
    const match = normalizedToOriginal.get(normalizeHeader(alias));
    if (match) return match;
  }

  return undefined;
}

function getRowSampleValue(record: Record<string, unknown>, header: string): string | null {
  const value = record[header];
  if (!isMeaningfulValue(value)) return null;
  return String(value).trim();
}

function analyzeColumns(rows: Record<string, unknown>[], headers: string[]) {
  return headers.map((header) => {
    const sampleValues: string[] = [];
    let nonEmptyCount = 0;

    for (const row of rows) {
      const value = row[header];
      if (!isMeaningfulValue(value)) continue;

      nonEmptyCount += 1;
      if (sampleValues.length < 3) {
        sampleValues.push(String(value).trim());
      }
    }

    return {
      header,
      nonEmptyCount,
      emptyCount: rows.length - nonEmptyCount,
      sampleValues,
    };
  });
}

function parseOptedOut(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseAttributes(value: unknown, rowNumber: number): Prisma.InputJsonValue {
  if (value == null || value === "") {
    return {};
  }

  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid attributes value on row ${rowNumber}`);
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Prisma.InputJsonValue;
    }
    throw new Error();
  } catch {
    throw new Error(`Invalid attributes JSON on row ${rowNumber}`);
  }
}

// GET /api/customers — list customers with pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    const take = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 100);
    const skip = Math.max(0, parseInt(req.query.offset as string) || 0);
    const search = (req.query.search as string) || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, take, skip, orderBy: { createdAt: "desc" } }),
      prisma.customer.count({ where }),
    ]);

    res.json({ customers, total });
  } catch (error) {
    console.error("Error in GET /api/customers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/customers/bulk — accepts JSON array of customer objects.
// Validates each row with zod; valid rows import, invalid rows are reported per-row.
// Duplicate emails are skipped (not errored) via createMany skipDuplicates.
router.post("/bulk", async (req: Request, res: Response) => {
  try {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: "Request body must be an array" });
      return;
    }

    const valid: Prisma.CustomerCreateManyInput[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    req.body.forEach((raw: unknown, i: number) => {
      const parsed = CustomerInput.safeParse(raw);
      if (parsed.success) {
        valid.push({
          name: parsed.data.name,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          city: parsed.data.city ?? null,
          optedOut: parsed.data.optedOut,
          attributes: parsed.data.attributes,
        });
      } else {
        errors.push({
          row: i + 1,
          error: parsed.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; "),
        });
      }
    });

    let imported = 0;
    if (valid.length) {
      const result = await prisma.customer.createMany({ data: valid, skipDuplicates: true });
      imported = result.count;
    }

    res.status(errors.length && !imported ? 400 : 201).json({
      received: req.body.length,
      imported,
      skipped: valid.length - imported, // duplicate emails
      rejected: errors.length,
      errors,
    });
  } catch (error) {
    console.error("Error in POST /api/customers/bulk:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/customers/import — accepts CSV file upload (multipart)
router.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const rawRows: Record<string, unknown>[] = [];
    const stream = Readable.from([req.file.buffer.toString("utf8")]);

    const parser = stream.pipe(
      parse({
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
    );

    let validatedHeaders = false;
    for await (const record of parser) {
      if (!validatedHeaders) {
        validatedHeaders = true;
        const headers = Object.keys(record).filter((key) => key.trim().length > 0);
        if (headers.length === 0) {
          res.status(400).json({ error: "CSV file does not contain any headers" });
          return;
        }
      }

      rawRows.push(record);
    }

    if (rawRows.length === 0) {
      res.status(400).json({ error: "CSV file is empty" });
      return;
    }

    const headers = Object.keys(rawRows[0]).filter((key) => key.trim().length > 0);
    const nameHeader = getHeaderMatch(headers, CUSTOMER_FIELD_ALIASES.name);
    const emailHeader = getHeaderMatch(headers, CUSTOMER_FIELD_ALIASES.email);
    const phoneHeader = getHeaderMatch(headers, CUSTOMER_FIELD_ALIASES.phone);
    const cityHeader = getHeaderMatch(headers, CUSTOMER_FIELD_ALIASES.city);
    const optedOutHeader = getHeaderMatch(headers, CUSTOMER_FIELD_ALIASES.optedOut);
    const attributesHeader = getHeaderMatch(headers, CUSTOMER_FIELD_ALIASES.attributes);

    const analysis = {
      rowCount: rawRows.length,
      columnCount: headers.length,
      headers,
      mappedFields: {
        name: nameHeader,
        email: emailHeader,
        phone: phoneHeader,
        city: cityHeader,
        optedOut: optedOutHeader,
        attributes: attributesHeader,
      },
      columns: analyzeColumns(rawRows, headers),
      sampleRows: rawRows.slice(0, 5),
    };

    const customerFieldPresent = Boolean(
      nameHeader || emailHeader || phoneHeader || cityHeader || optedOutHeader || attributesHeader
    );

    if (!customerFieldPresent) {
      res.status(200).json({
        count: 0,
        message:
          "CSV analyzed successfully. No customer-specific columns were detected, so no customers were imported.",
        analysis,
      });
      return;
    }

    const records: any[] = [];
    const importErrors: any[] = [];

    rawRows.forEach((record, index) => {
      const rowNumber = index + 2;
      try {
        const nameSource = nameHeader ? getRowSampleValue(record, nameHeader) : null;
        const fallbackNameSource =
          !nameSource && !nameHeader
            ? [emailHeader, phoneHeader, cityHeader]
                .map((header) => (header ? getRowSampleValue(record, header) : null))
                .find(Boolean) ?? null
            : null;
        const name = nameSource || fallbackNameSource || `Imported Customer ${rowNumber}`;

        const email = emailHeader ? getRowSampleValue(record, emailHeader) : null;
        const phone = phoneHeader ? getRowSampleValue(record, phoneHeader) : null;
        const city = cityHeader ? getRowSampleValue(record, cityHeader) : null;
        const optedOutValue = optedOutHeader ? record[optedOutHeader] : null;
        const attributesValue = attributesHeader ? record[attributesHeader] : null;

        if (!name) {
          throw new Error("Missing name");
        }

        records.push({
          name,
          email,
          phone,
          city,
          optedOut: parseOptedOut(optedOutValue),
          attributes: parseAttributes(attributesValue, rowNumber),
        });
      } catch (err: any) {
        importErrors.push({ row: rowNumber, error: err.message, data: record });
      }
    });

    if (records.length === 0) {
      res.status(400).json({
        error: "CSV could not be mapped to any importable customer records",
        analysis,
        errors: importErrors,
      });
      return;
    }

    const result = await prisma.customer.createMany({
      data: records,
      skipDuplicates: true,
    });

    res.status(201).json({
      count: result.count,
      analysis,
      imported: result.count,
      skipped: rawRows.length - result.count,
      errors: importErrors,
    });
  } catch (error) {
    console.log("Error in POST /api/customers/import:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
