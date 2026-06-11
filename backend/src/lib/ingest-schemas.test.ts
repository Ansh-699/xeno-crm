import { describe, it, expect } from "vitest";
import { CustomerInput, OrderInput } from "./ingest-schemas";

describe("CustomerInput", () => {
  it("accepts a minimal valid customer and applies defaults", () => {
    const r = CustomerInput.safeParse({ name: "Asha" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Asha");
      expect(r.data.optedOut).toBe(false);
      expect(r.data.attributes).toEqual({});
    }
  });

  it("trims name and rejects an empty one", () => {
    expect(CustomerInput.safeParse({ name: "   " }).success).toBe(false);
    const r = CustomerInput.safeParse({ name: "  Ravi  " });
    expect(r.success && r.data.name).toBe("Ravi");
  });

  it("rejects an invalid email", () => {
    const r = CustomerInput.safeParse({ name: "Ravi", email: "not-an-email" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "email")).toBe(true);
    }
  });

  it("accepts a full valid customer", () => {
    const r = CustomerInput.safeParse({
      name: "Meera",
      email: "meera@example.com",
      phone: "+919812345678",
      city: "Pune",
      optedOut: true,
      attributes: { tier: "gold" },
    });
    expect(r.success).toBe(true);
  });
});

describe("OrderInput", () => {
  it("coerces an ISO date string to a Date", () => {
    const r = OrderInput.safeParse({
      customerId: "cust_1",
      amount: 250,
      products: ["Latte"],
      channel: "online",
      orderedAt: "2025-05-01T10:00:00Z",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.orderedAt).toBeInstanceOf(Date);
  });

  it("rejects a negative amount", () => {
    const r = OrderInput.safeParse({
      customerId: "cust_1",
      amount: -5,
      products: ["Latte"],
      channel: "online",
      orderedAt: "2025-05-01T10:00:00Z",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "amount")).toBe(true);
    }
  });

  it("rejects a missing customerId", () => {
    const r = OrderInput.safeParse({
      amount: 100,
      products: [],
      channel: "app",
      orderedAt: "2025-05-01T10:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("accepts products as an array or an object", () => {
    const base = { customerId: "c1", amount: 1, channel: "app", orderedAt: "2025-05-01T10:00:00Z" };
    expect(OrderInput.safeParse({ ...base, products: ["A", "B"] }).success).toBe(true);
    expect(OrderInput.safeParse({ ...base, products: { items: ["A"] } }).success).toBe(true);
  });

  it("carries an optional externalId for dedup", () => {
    const r = OrderInput.safeParse({
      customerId: "c1",
      amount: 1,
      products: [],
      channel: "app",
      orderedAt: "2025-05-01T10:00:00Z",
      externalId: "shopify-1001",
    });
    expect(r.success && r.data.externalId).toBe("shopify-1001");
  });
});
