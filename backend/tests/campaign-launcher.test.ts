import { describe, it, expect } from "vitest";
import { hydrateTemplate } from "../src/lib/campaign-launcher";

describe("hydrateTemplate", () => {
  it("substitutes all known merge fields correctly", () => {
    const template = "Hi {{name}}, your top pick is {{top_product}} in {{city}}.";
    const result = hydrateTemplate(template, {
      name: "Priya",
      top_product: "Oat Latte",
      city: "Bangalore",
    });
    expect(result).toBe("Hi Priya, your top pick is Oat Latte in Bangalore.");
  });

  it("falls back to 'there' when name is missing", () => {
    const result = hydrateTemplate("Hi {{name}}!", { name: null });
    expect(result).toBe("Hi there!");
  });

  it("falls back to brand default when top_product is missing", () => {
    const result = hydrateTemplate("Try {{top_product}}", { top_product: undefined });
    // Should contain brand fallback, not the literal placeholder
    expect(result).not.toContain("{{top_product}}");
    expect(result.length).toBeGreaterThan(3);
  });

  it("falls back to '0' for total_orders when missing", () => {
    const result = hydrateTemplate("Orders: {{total_orders}}", { total_orders: null });
    expect(result).toBe("Orders: 0");
  });

  it("produces no leftover {{...}} placeholders when all fields present", () => {
    const template = "{{name}} {{top_product}} {{city}} {{days_since_last_order}} {{total_orders}}";
    const result = hydrateTemplate(template, {
      name: "Raj",
      top_product: "Espresso",
      city: "Mumbai",
      days_since_last_order: "5",
      total_orders: "12",
    });
    expect(result).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("produces no leftover {{...}} placeholders when all fields are missing", () => {
    const template = "{{name}} {{top_product}} {{city}} {{days_since_last_order}} {{total_orders}}";
    const result = hydrateTemplate(template, {});
    expect(result).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
