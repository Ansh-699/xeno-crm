/**
 * Segment Filter DSL → Prisma where clause converter
 *
 * Filter format:
 * {
 *   operator: "AND" | "OR",
 *   conditions: [
 *     { field: "city", op: "eq", value: "Mumbai" },
 *     { field: "orders.amount", op: "gt", value: 1000 },
 *     { field: "attributes.tier", op: "eq", value: "gold" }
 *   ]
 * }
 *
 * String comparisons (city, name, email, phone) are case-insensitive.
 * Date fields support relative expressions like "30 days ago" or "last 50 days".
 * Virtual field "lastOrderDays" translates to orders.orderedAt >= now() - N days.
 */

interface Condition {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: any;
}

interface FilterGroup {
  operator: "AND" | "OR";
  conditions: (Condition | FilterGroup)[];
}

function isFilterGroup(c: any): c is FilterGroup {
  return c && "operator" in c && "conditions" in c;
}

// Normalize symbolic operators some LLMs emit (e.g. ">", "=") to the canonical DSL ops.
const OP_ALIASES: Record<string, string> = {
  "=": "eq", "==": "eq", "===": "eq",
  "!=": "neq", "<>": "neq",
  ">": "gt", ">=": "gte",
  "<": "lt", "<=": "lte",
};

// Fields that are strings in the DB and should use case-insensitive matching.
const STRING_FIELDS = new Set(["city", "name", "email", "phone"]);

// Fields whose values are numeric. LLM providers (e.g. Gemini) may emit these as
// strings, so coerce here for correct numeric comparisons.
const NUMERIC_FIELDS = new Set(["orders.amount", "amount", "lastOrderDays"]);

// Date fields that accept absolute or relative date strings.
const DATE_FIELDS = new Set(["createdAt", "orders.orderedAt", "orderedAt"]);

/**
 * Parse relative date strings like "30 days ago", "last 50 days", "7d ago", etc.
 * Returns a Date if matched, otherwise null.
 */
function parseRelativeDate(value: string): Date | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();

  // Pattern: "N days ago" / "N day ago"
  let m = v.match(/^(\d+)\s*days?\s*ago$/);
  if (m) return new Date(Date.now() - parseInt(m[1]) * 24 * 60 * 60 * 1000);

  // Pattern: "last N days" / "past N days"
  m = v.match(/^(?:last|past)\s+(\d+)\s*days?$/);
  if (m) return new Date(Date.now() - parseInt(m[1]) * 24 * 60 * 60 * 1000);

  // Pattern: "Nd ago" (shorthand)
  m = v.match(/^(\d+)d\s*ago$/);
  if (m) return new Date(Date.now() - parseInt(m[1]) * 24 * 60 * 60 * 1000);

  // Pattern: "N months ago"
  m = v.match(/^(\d+)\s*months?\s*ago$/);
  if (m) return new Date(Date.now() - parseInt(m[1]) * 30 * 24 * 60 * 60 * 1000);

  // Pattern: "last N months"
  m = v.match(/^(?:last|past)\s+(\d+)\s*months?$/);
  if (m) return new Date(Date.now() - parseInt(m[1]) * 30 * 24 * 60 * 60 * 1000);

  return null;
}

/**
 * Process a date value — try relative first, then absolute ISO parse.
 */
function processDateValue(value: any): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const relative = parseRelativeDate(value);
    if (relative) return relative;
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  throw new Error(`Cannot parse date value: ${JSON.stringify(value)}`);
}

function mapOperator(op: string, value: any, isStringField: boolean): any {
  const normalized = OP_ALIASES[op] ?? op;
  switch (normalized) {
    case "eq":
      return isStringField
        ? { equals: value, mode: "insensitive" }
        : { equals: value };
    case "neq":
      return isStringField
        ? { not: { equals: value, mode: "insensitive" } }
        : { not: value };
    case "gt":
      return { gt: value };
    case "gte":
      return { gte: value };
    case "lt":
      return { lt: value };
    case "lte":
      return { lte: value };
    case "contains":
      return { contains: value, mode: "insensitive" };
    case "in": {
      const arr = Array.isArray(value) ? value : [value];
      if (isStringField) {
        // For case-insensitive "in", we use OR with equals+insensitive for each value.
        // Prisma doesn't support mode on `in`, so we'll handle this at buildCondition level.
        return { __ciIn: arr };
      }
      return { in: arr };
    }
    default:
      return isStringField
        ? { equals: value, mode: "insensitive" }
        : { equals: value };
  }
}

function buildCondition(condition: Condition): any {
  const { field, op, value } = condition;

  // Virtual field: "lastOrderDays" → operator-aware recency filter.
  //   within N days  (lt/lte/"<"/"within")  → has an order on/after the cutoff
  //   older / dormant (gt/gte/">"/"older")  → has NO order on/after the cutoff
  if (field === "lastOrderDays") {
    const days = typeof value === "string" ? parseInt(value) : value;
    if (isNaN(days)) {
      throw new Error(`Invalid value for lastOrderDays: ${value}`);
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const normalized = OP_ALIASES[op] ?? op;
    const isDormant = ["gt", "gte", "older"].includes(normalized);
    if (isDormant) {
      // "haven't ordered in N+ days" — no order within the window
      return {
        orders: {
          none: {
            orderedAt: { gte: cutoff },
          },
        },
      };
    }
    // "ordered within the last N days"
    return {
      orders: {
        some: {
          orderedAt: { gte: cutoff },
        },
      },
    };
  }

  // Determine field category
  const isString = STRING_FIELDS.has(field);
  const isDate = DATE_FIELDS.has(field);
  const isNumeric = NUMERIC_FIELDS.has(field);

  // Process value based on field type
  let processedValue = value;
  if (isDate) {
    processedValue = processDateValue(value);
  } else if (isNumeric && typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
    processedValue = Number(value);
  }

  // Handle nested fields
  if (field.startsWith("orders.")) {
    const orderField = field.replace("orders.", "");
    const isOrderStringField = orderField === "channel";
    const mapped = mapOperator(op, processedValue, isOrderStringField);

    // Handle case-insensitive "in" for order string fields
    if (mapped.__ciIn) {
      return {
        orders: {
          some: {
            OR: mapped.__ciIn.map((v: string) => ({
              [orderField]: { equals: v, mode: "insensitive" },
            })),
          },
        },
      };
    }

    return {
      orders: {
        some: {
          [orderField]: mapped,
        },
      },
    };
  }

  if (field.startsWith("attributes.")) {
    const attrPath = field.replace("attributes.", "");
    return {
      attributes: {
        path: [attrPath],
        ...(op === "eq"
          ? { equals: processedValue }
          : op === "contains"
            ? { string_contains: processedValue }
            : { equals: processedValue }),
      },
    };
  }

  // Direct fields — apply case-insensitive matching for string fields
  const mapped = mapOperator(op, processedValue, isString);

  // Handle case-insensitive "in" — expand to OR + equals+insensitive
  if (mapped.__ciIn) {
    return {
      OR: mapped.__ciIn.map((v: string) => ({
        [field]: { equals: v, mode: "insensitive" },
      })),
    };
  }

  return {
    [field]: mapped,
  };
}

export function filtersToWhere(filters: FilterGroup | any): any {
  if (!filters) return {};

  // Handle simple single-condition shorthand
  if (!isFilterGroup(filters)) {
    if (filters.field) {
      return buildCondition(filters as Condition);
    }
    return {};
  }

  const conditions = filters.conditions.map((c) => {
    if (isFilterGroup(c)) {
      return filtersToWhere(c);
    }
    return buildCondition(c);
  });

  if (filters.operator === "OR") {
    return { OR: conditions };
  }
  return { AND: conditions };
}

// Canonical operators plus their symbolic aliases and the lastOrderDays semantic ops.
const KNOWN_OPS = new Set<string>([
  "eq", "neq", "gt", "gte", "lt", "lte", "contains", "in",
  ...Object.keys(OP_ALIASES),
  "within", "older",
]);

// A leaf condition is valid only if it names a field, uses a known operator, and
// carries a value. `value === ""`/`undefined` is rejected so that a half-built
// condition (e.g. `{ field: "city", op: "eq" }`) can't silently match-all.
function isValidLeaf(c: any): boolean {
  if (!c || typeof c.field !== "string" || c.field.length === 0) return false;
  if (typeof c.op !== "string" || !KNOWN_OPS.has(c.op)) return false;
  if (c.value === undefined || c.value === null || c.value === "") return false;
  return true;
}

export function validateFilters(filters: any): boolean {
  if (!filters) return false;
  if (isFilterGroup(filters)) {
    if (!["AND", "OR"].includes(filters.operator)) return false;
    if (!Array.isArray(filters.conditions) || filters.conditions.length === 0)
      return false;
    return filters.conditions.every((c: any) =>
      isFilterGroup(c) ? validateFilters(c) : isValidLeaf(c)
    );
  }
  return isValidLeaf(filters);
}
