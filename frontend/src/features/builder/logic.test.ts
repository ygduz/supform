import { describe, expect, it } from "vitest";
import { parseLogic, serializeLogic } from "./logic";

describe("parseLogic", () => {
  it("parses a single comparison with each literal type", () => {
    expect(parseLogic('q1 == "yes"')).toEqual({
      connective: "and",
      conditions: [{ field: "q1", op: "==", value: "yes" }],
    });
    expect(parseLogic("age >= 18")).toEqual({
      connective: "and",
      conditions: [{ field: "age", op: ">=", value: 18 }],
    });
    expect(parseLogic("has_account == true")).toEqual({
      connective: "and",
      conditions: [{ field: "has_account", op: "==", value: true }],
    });
  });

  it("normalizes single = to ==", () => {
    expect(parseLogic("q1 = 'no'")).toEqual({
      connective: "and",
      conditions: [{ field: "q1", op: "==", value: "no" }],
    });
  });

  it("parses and/or chains with one connective", () => {
    expect(parseLogic('q1 == "a" and q2 > 3 and q3 != false')).toEqual({
      connective: "and",
      conditions: [
        { field: "q1", op: "==", value: "a" },
        { field: "q2", op: ">", value: 3 },
        { field: "q3", op: "!=", value: false },
      ],
    });
    expect(parseLogic("a < 1 or b < 2")?.connective).toBe("or");
  });

  it("rejects expressions beyond the simple subset", () => {
    expect(parseLogic('(q1 == "a") and q2 > 3')).toBeNull(); // parentheses
    expect(parseLogic('q1 == "a" and q2 > 3 or q3 == 1')).toBeNull(); // mixed connectives
    expect(parseLogic("not q1")).toBeNull();
    expect(parseLogic("q1 == q2")).toBeNull(); // field-to-field comparison
    expect(parseLogic("price * quantity > 10")).toBeNull();
    expect(parseLogic("")).toBeNull();
  });
});

describe("serializeLogic", () => {
  it("round-trips through parse", () => {
    const exprs = ['q1 == "yes"', "age >= 18 and score < 10", 'a != true or b == "x y"'];
    for (const e of exprs) {
      const parsed = parseLogic(e);
      expect(parsed).not.toBeNull();
      expect(parseLogic(serializeLogic(parsed!))).toEqual(parsed);
    }
  });

  it("quotes strings and leaves numbers/booleans bare", () => {
    expect(
      serializeLogic({
        connective: "or",
        conditions: [
          { field: "q1", op: "==", value: "yes" },
          { field: "q2", op: ">", value: 5 },
          { field: "q3", op: "==", value: false },
        ],
      }),
    ).toBe('q1 == "yes" or q2 > 5 or q3 == false');
  });
});
