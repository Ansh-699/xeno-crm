import { describe, it, expect } from "vitest";
import { filtersToWhere, validateFilters } from "./segments";

describe("filtersToWhere", () => {
  it("handles a simple eq filter on a direct string field (case-insensitive)", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "city", op: "eq", value: "Mumbai" }],
    });
    expect(result).toEqual({ AND: [{ city: { equals: "Mumbai", mode: "insensitive" } }] });
  });

  it("handles nested AND/OR groups with case-insensitive string matching", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [
        { field: "city", op: "eq", value: "Delhi" },
        {
          operator: "OR",
          conditions: [
            { field: "city", op: "eq", value: "Mumbai" },
            { field: "city", op: "eq", value: "Pune" },
          ],
        },
      ],
    });
    expect(result).toEqual({
      AND: [
        { city: { equals: "Delhi", mode: "insensitive" } },
        {
          OR: [
            { city: { equals: "Mumbai", mode: "insensitive" } },
            { city: { equals: "Pune", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("maps orders.* field to a { orders: { some: {...} } } clause", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "orders.amount", op: "gt", value: 1000 }],
    });
    expect(result).toEqual({
      AND: [{ orders: { some: { amount: { gt: 1000 } } } }],
    });
  });

  it("contains with empty string produces a case-insensitive contains clause", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "name", op: "contains", value: "" }],
    });
    expect(result).toEqual({
      AND: [{ name: { contains: "", mode: "insensitive" } }],
    });
  });

  it("returns empty object for null filters", () => {
    expect(filtersToWhere(null)).toEqual({});
    expect(filtersToWhere(undefined)).toEqual({});
  });

  it("handles relative date 'N days ago'", () => {
    const now = Date.now();
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "orders.orderedAt", op: "gte", value: "30 days ago" }],
    });
    const clause = result.AND[0].orders.some.orderedAt.gte;
    expect(clause).toBeInstanceOf(Date);
    // Should be roughly 30 days ago (within 1 second tolerance)
    const expected = now - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(clause.getTime() - expected)).toBeLessThan(1000);
  });

  it("handles relative date 'last N days'", () => {
    const now = Date.now();
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "createdAt", op: "gte", value: "last 50 days" }],
    });
    const clause = result.AND[0].createdAt.gte;
    expect(clause).toBeInstanceOf(Date);
    const expected = now - 50 * 24 * 60 * 60 * 1000;
    expect(Math.abs(clause.getTime() - expected)).toBeLessThan(1000);
  });

  it("handles virtual field lastOrderDays", () => {
    const now = Date.now();
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "lastOrderDays", op: "lte", value: "50" }],
    });
    const clause = result.AND[0].orders.some.orderedAt.gte;
    expect(clause).toBeInstanceOf(Date);
    const expected = now - 50 * 24 * 60 * 60 * 1000;
    expect(Math.abs(clause.getTime() - expected)).toBeLessThan(1000);
  });

  it("lastOrderDays with a 'greater than' op returns the DORMANT set (orders.none)", () => {
    const now = Date.now();
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "lastOrderDays", op: "gt", value: "90" }],
    });
    const leaf = result.AND[0];
    // Dormant = "haven't ordered in 90+ days" → no order within the window
    expect(leaf.orders.none).toBeDefined();
    expect(leaf.orders.some).toBeUndefined();
    const clause = leaf.orders.none.orderedAt.gte;
    expect(clause).toBeInstanceOf(Date);
    const expected = now - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(clause.getTime() - expected)).toBeLessThan(1000);
  });

  it("handles numeric string coercion for orders.amount", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "orders.amount", op: "gt", value: "5000" }],
    });
    expect(result).toEqual({
      AND: [{ orders: { some: { amount: { gt: 5000 } } } }],
    });
  });

  it("non-string fields use exact equals (no mode)", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "optedOut", op: "eq", value: false }],
    });
    expect(result).toEqual({
      AND: [{ optedOut: { equals: false } }],
    });
  });
});

describe("validateFilters", () => {
  it("rejects a leaf condition with no value", () => {
    expect(
      validateFilters({
        operator: "AND",
        conditions: [{ field: "city", op: "eq" }],
      })
    ).toBe(false);
    // also rejected as a bare leaf
    expect(validateFilters({ field: "city", op: "eq" })).toBe(false);
  });

  it("rejects an unknown operator", () => {
    expect(
      validateFilters({
        operator: "AND",
        conditions: [{ field: "city", op: "starts_with", value: "M" }],
      })
    ).toBe(false);
  });

  it("accepts a well-formed condition (including value false)", () => {
    expect(
      validateFilters({
        operator: "AND",
        conditions: [{ field: "optedOut", op: "eq", value: false }],
      })
    ).toBe(true);
  });
});

