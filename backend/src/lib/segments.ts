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

function mapOperator(op: string, value: any): any {
  switch (op) {
    case "eq":
      return { equals: value };
    case "neq":
      return { not: value };
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
    case "in":
      return { in: Array.isArray(value) ? value : [value] };
    default:
      return { equals: value };
  }
}

function buildCondition(condition: Condition): any {
  const { field, op, value } = condition;

  // Handle date values
  let processedValue = value;
  if (
    field === "createdAt" ||
    field === "orders.orderedAt" ||
    field === "orderedAt"
  ) {
    if (typeof value === "string") {
      processedValue = new Date(value);
    }
  }

  // Handle nested fields
  if (field.startsWith("orders.")) {
    const orderField = field.replace("orders.", "");
    return {
      orders: {
        some: {
          [orderField]: mapOperator(op, processedValue),
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

  // Direct fields
  return {
    [field]: mapOperator(op, processedValue),
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

export function validateFilters(filters: any): boolean {
  if (!filters) return false;
  if (isFilterGroup(filters)) {
    if (!["AND", "OR"].includes(filters.operator)) return false;
    if (!Array.isArray(filters.conditions) || filters.conditions.length === 0)
      return false;
    return filters.conditions.every((c: any) =>
      isFilterGroup(c) ? validateFilters(c) : !!c.field && !!c.op
    );
  }
  if (filters.field && filters.op) return true;
  return false;
}
