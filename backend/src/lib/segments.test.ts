import { describe, it, expect } from "vitest";
import { filtersToWhere } from "./segments";

describe("filtersToWhere", () => {
  it("handles a simple eq filter on a direct field", () => {
    const result = filtersToWhere({
      operator: "AND",
      conditions: [{ field: "city", op: "eq", value: "Mumbai" }],
    });
    expect(result).toEqual({ AND: [{ city: { equals: "Mumbai" } }] });
  });

  it("handles nested AND/OR groups", () => {
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
        { city: { equals: "Delhi" } },
        {
          OR: [
            { city: { equals: "Mumbai" } },
            { city: { equals: "Pune" } },
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
});
