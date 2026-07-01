import type { Element } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { collectCalcs, recalc, referencedNames, topoOrder } from "./recalc";

const el = (e: Record<string, unknown>) => e as unknown as Element;

describe("recalc (client mirror of backend recalc.py)", () => {
  it("extracts field refs, excluding function names and literals", () => {
    expect([...referencedNames("SUM(a, b) + c")].sort()).toEqual(["a", "b", "c"]);
    expect([...referencedNames('IF(x > 0, "y", "n")')]).toEqual(["x"]);
    expect([...referencedNames("ROUND(price, 2)")].sort()).toEqual(["price"]);
  });

  it("collects calc fields, descending groups but not repeats", () => {
    const els = [
      el({ type: "calculated", name: "a", calculate: "1" }),
      el({
        type: "group",
        name: "g",
        elements: [el({ type: "calculated", name: "b", calculate: "2" })],
      }),
      el({
        type: "repeat",
        name: "r",
        elements: [el({ type: "calculated", name: "c", calculate: "3" })],
      }),
    ];
    expect([...collectCalcs(els).keys()].sort()).toEqual(["a", "b"]);
  });

  it("orders by dependency regardless of declaration order", () => {
    const calcs = new Map([
      ["total", "subtotal + tax"],
      ["tax", "subtotal * 0.1"],
    ]);
    const { order, cyclic } = topoOrder(calcs);
    expect(cyclic.size).toBe(0);
    expect(order.indexOf("tax")).toBeLessThan(order.indexOf("total"));
  });

  it("detects cycles and excludes them from the order", () => {
    const { order, cyclic } = topoOrder(
      new Map([
        ["x", "y + 1"],
        ["y", "x + 1"],
      ]),
    );
    expect(cyclic.has("x") && cyclic.has("y")).toBe(true);
    expect(order).toEqual([]);
  });

  it("computes out-of-order calc fields in one pass", () => {
    const els = [
      el({ type: "calculated", name: "total", calculate: "subtotal + tax" }),
      el({ type: "number", name: "subtotal" }),
      el({ type: "calculated", name: "tax", calculate: "subtotal * 0.1" }),
    ];
    const { values } = recalc(els, { subtotal: 100 });
    expect(values.tax).toBeCloseTo(10);
    expect(values.total).toBeCloseTo(110);
  });
});

describe("recalc — non-finite guard (NaN render-loop regression)", () => {
  it("does not store NaN/Infinity for a calc whose inputs are unanswered", () => {
    const e = (o: Record<string, unknown>) => o as unknown as Element;
    const els = [
      e({ type: "number", name: "qty" }),
      e({ type: "number", name: "price" }),
      e({ type: "calculated", name: "total", calculate: "qty * price" }),
      e({ type: "calculated", name: "ratio", calculate: "qty / 0" }),
    ];
    const { values } = recalc(els, {}); // nothing answered
    expect("total" in values).toBe(false); // NaN -> skipped, not stored
    expect("ratio" in values).toBe(false); // Infinity -> skipped
  });
});
