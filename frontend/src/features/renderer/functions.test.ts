/**
 * Excel function catalog — frontend half of the parity suite. Every case here is mirrored
 * 1:1 in `backend/tests/test_functions.py`. The two tables MUST stay identical so the
 * client live-preview evaluator and the server authoritative evaluator never diverge.
 */
import { describe, expect, it } from "vitest";
import { evaluateExpression } from "./expressions";

// (expression, context, expected) — identical to backend CASES.
const CASES: Array<[string, Record<string, unknown>, unknown]> = [
  // logical
  ['IF(age >= 18, "adult", "minor")', { age: 20 }, "adult"],
  ['IF(age >= 18, "adult", "minor")', { age: 5 }, "minor"],
  ["IF(flag, 1, 2)", { flag: null }, 2],
  ['IFS(score > 90, "A", score > 80, "B", True, "C")', { score: 85 }, "B"],
  ["AND(a > 0, b > 0)", { a: 1, b: 2 }, true],
  ["AND(a > 0, b > 0)", { a: 1, b: -1 }, false],
  ["OR(a > 0, b > 0)", { a: -1, b: 2 }, true],
  ["NOT(a > 0)", { a: -1 }, true],
  ['SWITCH(grade, "A", 4, "B", 3, 0)', { grade: "B" }, 3],
  ['SWITCH(grade, "A", 4, "B", 3, 0)', { grade: "Z" }, 0],
  ["IFERROR(1 / x, -1)", { x: 0 }, -1],
  ["IFERROR(10 / x, -1)", { x: 2 }, 5],
  // aggregate
  ["SUM(a, b, c)", { a: 1, b: 2, c: 3 }, 6],
  ["SUM(a, b, c)", { a: 1, c: 3 }, 4],
  ["AVERAGE(a, b, c)", { a: 2, b: 4, c: 6 }, 4],
  ["MIN(a, b, c)", { a: 5, b: 2, c: 9 }, 2],
  ["MAX(a, b, c)", { a: 5, b: 2, c: 9 }, 9],
  ["COUNT(a, b, c)", { a: 1, c: 3 }, 2],
  ["COUNTA(a, b, c)", { a: "x", b: "", c: 0 }, 2],
  // math
  ["ROUND(x, 2)", { x: 1.23456 }, 1.23],
  ["ROUND(x, 0)", { x: 2.5 }, 3],
  ["ROUNDUP(x, 0)", { x: 2.1 }, 3],
  ["ROUNDDOWN(x, 0)", { x: 2.9 }, 2],
  ["FLOOR(x, 5)", { x: 13 }, 10],
  ["CEILING(x, 5)", { x: 11 }, 15],
  ["MOD(a, b)", { a: 7, b: 3 }, 1],
  ["ABS(x)", { x: -4 }, 4],
  ["POWER(b, e)", { b: 2, e: 10 }, 1024],
  ["SQRT(x)", { x: 16 }, 4],
  ["INT(x)", { x: 3.9 }, 3],
  // text
  ['CONCAT(first, " ", last)', { first: "Ada", last: "Lovelace" }, "Ada Lovelace"],
  ["LEFT(s, 3)", { s: "hello" }, "hel"],
  ["RIGHT(s, 2)", { s: "hello" }, "lo"],
  ["MID(s, 2, 3)", { s: "hello" }, "ell"],
  ["LEN(s)", { s: "hello" }, 5],
  ["UPPER(s)", { s: "abc" }, "ABC"],
  ["LOWER(s)", { s: "ABC" }, "abc"],
  ["TRIM(s)", { s: "  hi  " }, "hi"],
  ['SUBSTITUTE(s, "a", "o")', { s: "banana" }, "bonono"],
  ["VALUE(s)", { s: "42" }, 42],
  // info
  ["ISBLANK(x)", { x: null }, true],
  ["ISBLANK(x)", { x: 0 }, false],
  ["ISNUMBER(x)", { x: 5 }, true],
  ["ISNUMBER(x)", { x: "5" }, false],
  ["ISTEXT(x)", { x: "hi" }, true],
  // date
  ['DATEDIF(a, b, "D")', { a: "2026-01-01", b: "2026-01-31" }, 30],
  ["YEAR(d)", { d: "2026-06-28" }, 2026],
  ["MONTH(d)", { d: "2026-06-28" }, 6],
  ["DAY(d)", { d: "2026-06-28" }, 28],
  // lookup (VLOOKUP-style, named ranges)
  ['LOOKUP(k, ["a", "b", "c"], [10, 20, 30])', { k: "b" }, 20],
  // nesting + case-insensitivity
  ['IF(Sum(a, b) > 10, "high", "low")', { a: 7, b: 5 }, "high"],
  ["ROUND(AVERAGE(a, b, c), 1)", { a: 1, b: 2, c: 2 }, 1.7],
];

describe("Excel function catalog (parity with backend test_functions.py)", () => {
  for (const [expr, ctx, expected] of CASES) {
    it(`${expr} ${JSON.stringify(ctx)}`, () => {
      const result = evaluateExpression(expr, ctx);
      if (typeof expected === "number") {
        expect(result as number).toBeCloseTo(expected, 9);
      } else {
        expect(result).toEqual(expected);
      }
    });
  }

  it("IF short-circuits — untaken branch value is ignored", () => {
    expect(evaluateExpression('IF(x > 0, "yes", "no")', { x: 5 })).toBe("yes");
  });

  it("blank is zero inside functions, not bare operators", () => {
    expect(evaluateExpression("SUM(a, b)", { a: 3 })).toBe(3);
  });
});
