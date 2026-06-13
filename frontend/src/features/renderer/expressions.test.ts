import { describe, expect, it } from "vitest";
import { evaluateValue } from "./expressions";

describe("evaluateValue", () => {
  it("computes arithmetic across answered fields", () => {
    expect(evaluateValue("qty * unit_price", { qty: 3, unit_price: 4 })).toBe(12);
  });

  it("coerces numeric strings", () => {
    expect(evaluateValue("a + b", { a: "2", b: "5" })).toBe(7);
  });

  it("defaults unanswered references to 0", () => {
    expect(evaluateValue("qty * unit_price", { qty: 3 })).toBe(0);
    expect(evaluateValue("a + b", {})).toBe(0);
  });

  it("honors parentheses and operator precedence", () => {
    expect(evaluateValue("(a + b) * c", { a: 1, b: 2, c: 3 })).toBe(9);
  });

  it("returns undefined for an empty or invalid expression", () => {
    expect(evaluateValue(undefined, {})).toBeUndefined();
    expect(evaluateValue("", {})).toBeUndefined();
    expect(evaluateValue("1 / 0", {})).toBeUndefined(); // Infinity is not finite
  });
});
