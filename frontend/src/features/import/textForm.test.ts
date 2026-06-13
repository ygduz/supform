import { describe, expect, it } from "vitest";
import { parseTextForm, summarize } from "./textForm";

describe("parseTextForm", () => {
  it("reads a title, a plain question, and a choice question", () => {
    const schema = parseTextForm(
      ["# Feedback", "- Your name *", "- Favourite colour", "  • Red", "  • Blue"].join("\n"),
    );
    expect(schema.title).toBe("Feedback");
    const els = schema.pages[0].elements;
    expect(els).toHaveLength(2);
    expect(els[0]).toMatchObject({ type: "text", label: "Your name", required: true });
    expect(els[1]).toMatchObject({ type: "single_choice", label: "Favourite colour" });
    expect(els[1].options?.map((o) => o.label)).toEqual(["Red", "Blue"]);
  });

  it("honors explicit types and aliases", () => {
    const schema = parseTextForm(
      ["- Email (email)", "- Notes (paragraph)", "- Pick many (multi)", "  • A", "  • B"].join(
        "\n",
      ),
    );
    const [email, notes, multi] = schema.pages[0].elements;
    expect(email.type).toBe("email");
    expect(notes.type).toBe("longtext");
    expect(multi.type).toBe("multi_choice");
    expect(multi.options).toHaveLength(2);
  });

  it("nests questions under sections", () => {
    const schema = parseTextForm(
      ["* About you", "- Name", "* Preferences", "- Colour", "  • Red"].join("\n"),
    );
    const els = schema.pages[0].elements;
    expect(els).toHaveLength(2);
    expect(els[0]).toMatchObject({ type: "group", label: "About you" });
    expect(els[0].elements?.[0].label).toBe("Name");
    expect(els[1].elements?.[0].type).toBe("single_choice");
  });

  it("attaches help text to the preceding question", () => {
    const schema = parseTextForm(["- Age", "> Must be 18 or older"].join("\n"));
    expect(schema.pages[0].elements[0].hint).toBe("Must be 18 or older");
  });

  it("generates unique snake_case field keys", () => {
    const schema = parseTextForm(["- Your name", "- Your name"].join("\n"));
    const names = schema.pages[0].elements.map((e) => e.name);
    expect(names[0]).toBe("your_name");
    expect(names[1]).toBe("your_name_2");
  });

  it("ignores stray bullets under an explicit non-choice type", () => {
    const schema = parseTextForm(["- Notes (paragraph)", "  • not a choice"].join("\n"));
    expect(schema.pages[0].elements[0].type).toBe("longtext");
    expect(schema.pages[0].elements[0].options).toBeUndefined();
  });

  it("returns a usable empty form for blank input", () => {
    const schema = parseTextForm("   \n\n");
    expect(schema.pages[0].elements).toHaveLength(0);
    expect(schema.title).toBe("Imported form");
  });

  it("summarize counts sections and questions", () => {
    const schema = parseTextForm(["* S", "- a", "- b", "- c"].join("\n"));
    expect(summarize(schema)).toEqual({ sections: 1, questions: 3 });
  });
});
