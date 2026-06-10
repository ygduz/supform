import { describe, expect, it } from "vitest";
import { allElements } from "../builder/model";
import { TEMPLATES } from "./templates";

describe("form templates", () => {
  it("exposes a sizeable gallery with unique ids and form names", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(9);
    const ids = TEMPLATES.map((t) => t.id);
    const names = TEMPLATES.map((t) => t.schema.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every template is a well-formed schema with uniquely-named fields", () => {
    for (const template of TEMPLATES) {
      const { schema } = template;
      expect(schema.pages.length).toBeGreaterThan(0);

      const elements = allElements(schema);
      expect(elements.length).toBeGreaterThan(0);
      for (const el of elements) {
        expect(el.type).toBeTruthy();
        expect(el.name).toBeTruthy();
      }
      const fieldNames = elements.map((el) => el.name);
      expect(new Set(fieldNames).size).toBe(fieldNames.length);
    }
  });

  it("choice fields carry options", () => {
    for (const template of TEMPLATES) {
      for (const el of allElements(template.schema)) {
        if (["single_choice", "multi_choice", "dropdown", "scale", "rating"].includes(el.type)) {
          expect(el.options?.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
