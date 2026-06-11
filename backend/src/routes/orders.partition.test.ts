import { describe, it, expect } from "vitest";
import { partitionOrdersByCustomer, IndexedOrder } from "./orders";
import type { OrderInputT } from "../lib/ingest-schemas";

function data(customerId: string, externalId?: string): OrderInputT {
  return {
    customerId,
    amount: 100,
    products: ["Latte"],
    channel: "online",
    orderedAt: new Date("2025-05-01T10:00:00Z"),
    externalId: externalId ?? null,
  };
}

function indexed(row: number, customerId: string, externalId?: string): IndexedOrder {
  return { row, data: data(customerId, externalId) };
}

describe("partitionOrdersByCustomer", () => {
  it("routes unknown customerIds to errors and keeps the rest insertable", () => {
    const rows = [indexed(1, "known_1"), indexed(2, "ghost"), indexed(3, "known_2")];
    const known = new Set(["known_1", "known_2"]);

    const { insertable, errors } = partitionOrdersByCustomer(rows, known);

    expect(insertable).toHaveLength(2);
    expect(insertable.map((o) => o.customerId)).toEqual(["known_1", "known_2"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ row: 2, error: "unknown customerId: ghost" });
  });

  it("uses the carried original row number, not the array position", () => {
    // Simulates: request rows 1 & 2 failed zod validation and were dropped, so the
    // surviving rows start at original index 3. A linkage error must report row 4,
    // not its array position (2).
    const rows = [indexed(3, "known"), indexed(4, "ghost")];
    const { insertable, errors } = partitionOrdersByCustomer(rows, new Set(["known"]));

    expect(insertable).toHaveLength(1);
    expect(errors).toEqual([{ row: 4, error: "unknown customerId: ghost" }]);
  });

  it("returns no errors when every customer is known", () => {
    const rows = [indexed(1, "a"), indexed(2, "b")];
    const { insertable, errors } = partitionOrdersByCustomer(rows, new Set(["a", "b"]));
    expect(errors).toHaveLength(0);
    expect(insertable).toHaveLength(2);
  });

  it("passes externalId through to insertable rows for dedup", () => {
    const rows = [indexed(1, "a", "ext-1")];
    const { insertable } = partitionOrdersByCustomer(rows, new Set(["a"]));
    expect(insertable[0].externalId).toBe("ext-1");
  });

  it("defaults a missing externalId to null", () => {
    const rows = [indexed(1, "a")];
    const { insertable } = partitionOrdersByCustomer(rows, new Set(["a"]));
    expect(insertable[0].externalId).toBeNull();
  });

  it("rejects all rows when no customers are known", () => {
    const rows = [indexed(1, "x"), indexed(2, "y")];
    const { insertable, errors } = partitionOrdersByCustomer(rows, new Set());
    expect(insertable).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });
});
