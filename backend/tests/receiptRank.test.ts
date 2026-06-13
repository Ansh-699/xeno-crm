import { describe, it, expect } from "vitest";

// Mirror the STATUS_RANK map from routes/receipts.ts
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  read: 3,
  clicked: 4,
};

// Simulate the monotonicity gate: new event is accepted only if its rank > current rank
function wouldUpdate(currentStatus: string, newStatus: string): boolean {
  if (currentStatus === "failed") return false;
  return (STATUS_RANK[newStatus] ?? 0) > (STATUS_RANK[currentStatus] ?? 0);
}

describe("STATUS_RANK monotonicity", () => {
  it("delivered rank > sent rank", () => {
    expect(STATUS_RANK.delivered).toBeGreaterThan(STATUS_RANK.sent);
  });

  it("clicked rank > read rank", () => {
    expect(STATUS_RANK.clicked).toBeGreaterThan(STATUS_RANK.read);
  });

  it("opened and read share the same rank (lateral siblings)", () => {
    expect(STATUS_RANK.opened).toBe(STATUS_RANK.read);
  });

  it("sent cannot overwrite delivered", () => {
    expect(wouldUpdate("delivered", "sent")).toBe(false);
  });

  it("clicked can advance from delivered", () => {
    expect(wouldUpdate("delivered", "clicked")).toBe(true);
  });

  it("failed is terminal — no further updates", () => {
    expect(wouldUpdate("failed", "clicked")).toBe(false);
    expect(wouldUpdate("failed", "delivered")).toBe(false);
  });

  it("opened cannot overwrite clicked", () => {
    expect(wouldUpdate("clicked", "opened")).toBe(false);
  });
});
