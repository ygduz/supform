import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { evaluateBool } from "../renderer/expressions";
import {
  type ConnOp,
  buildConnectorExpression,
  collectConnectors,
  parseConnector,
} from "./connectors";

describe("buildConnectorExpression", () => {
  it("quotes string values", () => {
    expect(buildConnectorExpression("colour", "==", "red")).toBe('colour == "red"');
  });

  it("leaves booleans bare so they match the stored answer", () => {
    expect(buildConnectorExpression("agree", "==", true)).toBe("agree == true");
    expect(buildConnectorExpression("agree", "!=", false)).toBe("agree != false");
  });

  it("leaves numbers bare", () => {
    expect(buildConnectorExpression("score", "==", 3)).toBe("score == 3");
  });

  it("escapes embedded quotes", () => {
    expect(buildConnectorExpression("q", "==", 'a"b')).toBe('q == "a\\"b"');
  });
});

describe("parseConnector", () => {
  it("returns null for non-connector expressions", () => {
    expect(parseConnector("t", undefined)).toBeNull();
    expect(parseConnector("t", "age >= 18")).toBeNull();
    expect(parseConnector("t", "a == b")).toBeNull(); // unquoted identifier, not a literal
  });

  it("parses quoted strings (single or double)", () => {
    expect(parseConnector("t", 'colour == "red"')).toMatchObject({
      fromName: "colour",
      op: "==",
      value: "red",
      display: "red",
    });
    expect(parseConnector("t", "colour != 'red'")).toMatchObject({ op: "!=", value: "red" });
  });

  it("parses booleans and shows Yes/No", () => {
    expect(parseConnector("t", "agree == true")).toMatchObject({ value: true, display: "Yes" });
    expect(parseConnector("t", "agree == false")).toMatchObject({ value: false, display: "No" });
  });

  it("parses numbers", () => {
    expect(parseConnector("t", "score == 3")).toMatchObject({ value: 3, display: "3" });
    expect(parseConnector("t", "score == -2.5")).toMatchObject({ value: -2.5 });
  });
});

describe("round-trip build -> parse", () => {
  const cases: Array<[string, ConnOp, string | number | boolean]> = [
    ["colour", "==", "red"],
    ["agree", "==", true],
    ["agree", "!=", false],
    ["score", "==", 7],
    ["note", "==", 'say "hi"'],
  ];
  for (const [from, op, value] of cases) {
    it(`survives ${from} ${op} ${String(value)}`, () => {
      const expr = buildConnectorExpression(from, op, value);
      const parsed = parseConnector("target", expr);
      expect(parsed).toMatchObject({ fromName: from, op, value });
    });
  }
});

describe("collectConnectors walks the whole tree", () => {
  it("finds connectors on nested elements", () => {
    const schema: FormSchema = {
      schemaVersion: "1.0",
      name: "f",
      title: "F",
      pages: [
        {
          name: "p1",
          elements: [
            { type: "single_choice", name: "q1", options: [{ value: "a" }] },
            { type: "text", name: "q2", visibleIf: 'q1 == "a"' },
            {
              type: "group",
              name: "g1",
              elements: [{ type: "text", name: "q3", visibleIf: 'q1 != "a"' }],
            },
          ],
        },
      ],
    };
    const conns = collectConnectors(schema);
    expect(conns).toHaveLength(2);
    expect(conns.map((c) => c.toName).sort()).toEqual(["q2", "q3"]);
  });
});

// The reason booleans are emitted bare: the runtime engine compares against the real
// stored answer (JS boolean), and `true == "true"` is false. This guards that contract.
describe("generated expressions actually evaluate against stored answers", () => {
  it("matches a boolean Yes answer", () => {
    const expr = buildConnectorExpression("agree", "==", true);
    expect(evaluateBool(expr, { agree: true })).toBe(true);
    expect(evaluateBool(expr, { agree: false })).toBe(false);
  });

  it("matches a string choice answer", () => {
    const expr = buildConnectorExpression("colour", "==", "red");
    expect(evaluateBool(expr, { colour: "red" })).toBe(true);
    expect(evaluateBool(expr, { colour: "blue" })).toBe(false);
  });

  it("honors !=", () => {
    const expr = buildConnectorExpression("colour", "!=", "red");
    expect(evaluateBool(expr, { colour: "blue" })).toBe(true);
    expect(evaluateBool(expr, { colour: "red" })).toBe(false);
  });
});
