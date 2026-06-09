import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import * as m from "./model";

const empty = (): FormSchema => m.createEmptyForm();

describe("element ops (flat)", () => {
  it("adds an element to the active page with a unique name", () => {
    const { schema, name } = m.addElement(empty(), "text");
    expect(name).toBe("q1");
    expect(m.pageElements(schema, 0)).toHaveLength(1);
    expect(m.findElement(schema, "q1")?.type).toBe("text");
  });

  it("seeds option lists for choice/scale types", () => {
    const { schema } = m.addElement(empty(), "single_choice");
    expect(m.findElement(schema, "q1")?.options).toHaveLength(2);
    const scale = m.addElement(empty(), "scale").schema;
    expect(m.findElement(scale, "q1")?.options).toHaveLength(5);
  });

  it("updates and removes by name", () => {
    let s = m.addElement(empty(), "text").schema;
    s = m.updateElement(s, "q1", { label: "Name", required: true });
    expect(m.findElement(s, "q1")?.label).toBe("Name");
    s = m.removeElement(s, "q1");
    expect(m.findElement(s, "q1")).toBeNull();
  });

  it("moves within siblings", () => {
    let s = empty();
    s = m.addElement(s, "text").schema; // q1
    s = m.addElement(s, "text").schema; // q2
    s = m.moveBy(s, "q2", -1);
    expect(m.pageElements(s, 0).map((e) => e.name)).toEqual(["q2", "q1"]);
  });
});

describe("containers (group / repeat)", () => {
  it("adds elements inside a container via parentName", () => {
    let s = m.addElement(empty(), "group").schema; // q1 (group)
    const added = m.addElement(s, "text", { parentName: "q1" });
    s = added.schema;
    expect(m.pageElements(s, 0)).toHaveLength(1); // still one top-level element
    expect(m.findElement(s, "q1")?.elements).toHaveLength(1);
    expect(m.findElement(s, added.name)).not.toBeNull(); // findable via deep search
  });

  it("updates and removes nested elements", () => {
    let s = m.addElement(empty(), "repeat").schema; // q1
    const child = m.addElement(s, "text", { parentName: "q1" });
    s = m.updateElement(child.schema, child.name, { label: "Member" });
    expect(m.findElement(s, child.name)?.label).toBe("Member");
    s = m.removeElement(s, child.name);
    expect(m.findElement(s, "q1")?.elements).toHaveLength(0);
  });

  it("repeat carries default repeat settings", () => {
    const s = m.addElement(empty(), "repeat").schema;
    expect(m.findElement(s, "q1")?.repeat).toEqual({ min: 0 });
  });
});

describe("duplicateElement", () => {
  it("clones a container subtree with fresh, unique names", () => {
    let s = m.addElement(empty(), "group").schema; // q1
    s = m.addElement(s, "text", { parentName: "q1" }).schema; // q2 inside q1
    const dup = m.duplicateElement(s, "q1");
    s = dup.schema;

    expect(m.pageElements(s, 0)).toHaveLength(2); // original + copy at top level
    const names = m.allElements(s).map((e) => e.name);
    expect(new Set(names).size).toBe(names.length); // all names unique
    expect(m.findElement(s, dup.name)?.elements).toHaveLength(1); // child cloned too
  });
});

describe("list-field editing", () => {
  it("edits matrix rows and columns independently", () => {
    let s = m.addElement(empty(), "matrix").schema; // q1 with 2 rows / 2 cols
    s = m.addRow(s, "q1");
    s = m.addColumn(s, "q1");
    expect(m.findElement(s, "q1")?.rows).toHaveLength(3);
    expect(m.findElement(s, "q1")?.columns).toHaveLength(3);
    s = m.removeRow(s, "q1", 0);
    expect(m.findElement(s, "q1")?.rows).toHaveLength(2);
  });
});

describe("pages", () => {
  it("adds, renames, and removes pages (never below one)", () => {
    let s = empty();
    const added = m.addPage(s);
    s = added.schema;
    expect(s.pages).toHaveLength(2);
    expect(added.index).toBe(1);

    s = m.renamePage(s, 1, "Section B");
    expect(s.pages[1].title).toBe("Section B");

    s = m.removePage(s, 1);
    expect(s.pages).toHaveLength(1);
    s = m.removePage(s, 0); // refuses to remove the last page
    expect(s.pages).toHaveLength(1);
  });

  it("adds an element to a specific page", () => {
    let s = m.addPage(empty()).schema;
    s = m.addElement(s, "text", { pageIndex: 1 }).schema;
    expect(m.pageElements(s, 0)).toHaveLength(0);
    expect(m.pageElements(s, 1)).toHaveLength(1);
  });
});
