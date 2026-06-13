import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import { elementIndex, pipe } from "./piping";

const schema: FormSchema = {
  schemaVersion: "1.0",
  name: "f",
  title: "F",
  pages: [
    {
      name: "p1",
      elements: [
        { type: "text", name: "first_name", label: "First name" },
        {
          type: "single_choice",
          name: "color",
          label: "Color",
          options: [
            { value: "r", label: "Red" },
            { value: "b", label: "Blue" },
          ],
        },
        {
          type: "multi_choice",
          name: "langs",
          label: "Languages",
          options: [
            { value: "ts", label: "TypeScript" },
            { value: "py", label: "Python" },
          ],
        },
      ],
    },
  ],
};

const idx = elementIndex(schema);

describe("pipe", () => {
  it("substitutes a known field with its answer", () => {
    expect(pipe("Hi {first_name}!", idx, { first_name: "Ada" }, "en")).toBe("Hi Ada!");
  });

  it("resolves choice values to their option labels", () => {
    expect(pipe("You picked {color}", idx, { color: "b" }, "en")).toBe("You picked Blue");
  });

  it("joins multi-select labels", () => {
    expect(pipe("{langs}", idx, { langs: ["ts", "py"] }, "en")).toBe("TypeScript, Python");
  });

  it("renders empty for an unanswered known field", () => {
    expect(pipe("Hi {first_name}!", idx, {}, "en")).toBe("Hi !");
  });

  it("leaves unknown tokens verbatim", () => {
    expect(pipe("Total: {not_a_field}", idx, {}, "en")).toBe("Total: {not_a_field}");
  });

  it("returns text unchanged when there are no tokens", () => {
    expect(pipe("No tokens here", idx, {}, "en")).toBe("No tokens here");
  });
});
