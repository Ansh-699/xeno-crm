import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { backfillAttribution, attributeOrder } from "../lib/attribution";
import { OrderInput, OrderInputT } from "../lib/ingest-schemas";

const router = Router();

/** A validated order paired with the 1-based index of its row in the original request. */
export interface IndexedOrder {
  row: number;
  data: OrderInputT;
}

/**
 * Partition validated orders into insertable rows (customer exists) and errors
 * (unknown customerId). Pure function so the linkage logic can be unit-tested
 * without a database. Each row carries its original 1-based request index, so
 * linkage-error row numbers stay correct even when earlier rows failed validation
 * and were dropped from the array.
 */
export function partitionOrdersByCustomer(
  rows: IndexedOrder[],
  knownCustomerIds: Set<string>
): {
  insertable: Prisma.OrderCreateManyInput[];
  errors: Array<{ row: number; error: string }>;
} {
  const insertable: Prisma.OrderCreateManyInput[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (const { row, data: o } of rows) {
    if (!knownCustomerIds.has(o.customerId)) {
      errors.push({ row, error: `unknown customerId: ${o.customerId}` });
    } else {
      insertable.push({
        externalId: o.externalId ?? null,
        customerId: o.customerId,
        amount: o.amount,
        products: o.products as Prisma.InputJsonValue,
        channel: o.channel,
        orderedAt: o.orderedAt,
      });
    }
  }

  return { insertable, errors };
}

// POST /api/orders/bulk — validate, verify customer linkage, dedup on externalId,
// insert, and attribute each new order in real time (7-day most-recent-delivery window).
router.post("/bulk", async (req: Request, res: Response) => {
  try {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: "Request body must be an array" });
      return;
    }

    // 1. Validate each row, carrying its original 1-based request index forward so
    //    later linkage errors point at the right input row.
    const parsedRows: IndexedOrder[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    req.body.forEach((raw: unknown, i: number) => {
      const parsed = OrderInput.safeParse(raw);
      if (parsed.success) parsedRows.push({ row: i + 1, data: parsed.data });
      else
        errors.push({
          row: i + 1,
          error: parsed.error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; "),
        });
    });

    // 2. Verify referenced customers exist (avoids an FK error blowing up the batch)
    const customerIds = [...new Set(parsedRows.map((o) => o.data.customerId))];
    const found = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((c) => c.id));

    const { insertable, errors: linkageErrors } = partitionOrdersByCustomer(parsedRows, foundSet);
    errors.push(...linkageErrors);

    // 3. Insert (skipDuplicates dedupes on unique externalId), return created IDs
    let created: { id: string }[] = [];
    if (insertable.length) {
      created = await prisma.order.createManyAndReturn({
        data: insertable,
        skipDuplicates: true,
        select: { id: true },
      });
    }

    // 4. Real-time attribution for each newly ingested order
    let attributed = 0;
    for (const o of created) {
      const comm = await attributeOrder(o.id);
      if (comm) attributed++;
    }

    res.status(errors.length && !created.length ? 400 : 201).json({
      received: req.body.length,
      imported: created.length,
      skipped: insertable.length - created.length, // duplicate externalIds
      rejected: errors.length,
      attributed,
      errors,
    });
  } catch (error) {
    console.error("Error in POST /api/orders/bulk:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/orders/backfill-attribution — admin: attribute seeded/existing orders
router.post("/backfill-attribution", async (_req: Request, res: Response) => {
  try {
    const count = await backfillAttribution();
    res.json({ ok: true, ordersProcessed: count });
  } catch (error) {
    console.error("Error in POST /api/orders/backfill-attribution:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
