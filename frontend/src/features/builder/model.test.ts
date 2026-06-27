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

describe("ungroupElement", () => {
  /** page: q1, group(q3 [q2, q4]), q5 — built by grouping q2+q4 */
  const grouped = () => {
    let s = empty();
    s = m.addElement(s, "text").schema; // q1
    s = m.addElement(s, "text").schema; // q2
    s = m.addElement(s, "text").schema; // q3
    const g = m.groupElements(s, ["q2", "q3"]);
    return g.schema; // q1, q4(group: q2, q3)
  };

  it("replaces the group with its children in place", () => {
    const s = grouped();
    expect(m.pageElements(s, 0).map((e) => e.name)).toEqual(["q1", "q4"]);
    const { schema, childNames } = m.ungroupElement(s, "q4");
    expect(childNames).toEqual(["q2", "q3"]);
    expect(m.pageElements(schema, 0).map((e) => e.name)).toEqual(["q1", "q2", "q3"]);
    expect(m.findElement(schema, "q4")).toBeNull();
  });

  it("removes an empty group", () => {
    const s = m.addElement(empty(), "group").schema; // q1
    const { schema, childNames } = m.ungroupElement(s, "q1");
    expect(childNames).toEqual([]);
    expect(m.pageElements(schema, 0)).toHaveLength(0);
  });

  it("no-ops for non-container elements", () => {
    const s = m.addElement(empty(), "text").schema;
    const { schema } = m.ungroupElement(s, "q1");
    expect(schema).toBe(s);
  });
});

describe("moveElementTo (cross-container drag & drop)", () => {
  /** page: q1 (group), q2, q3 */
  const base = () => {
    let s = m.addElement(empty(), "group").schema; // q1
    s = m.addElement(s, "text").schema; // q2
    s = m.addElement(s, "text").schema; // q3
    return s;
  };

  it("moves a top-level element into a group", () => {
    const s = m.moveElementTo(base(), "q2", { pageIndex: 0, parentName: "q1" }, 0);
    expect(m.pageElements(s, 0).map((e) => e.name)).toEqual(["q1", "q3"]);
    expect(m.findElement(s, "q1")?.elements?.map((e) => e.name)).toEqual(["q2"]);
  });

  it("moves an element out of a group to the page at an index", () => {
    let s = m.moveElementTo(base(), "q2", { pageIndex: 0, parentName: "q1" }, 0);
    s = m.moveElementTo(s, "q2", { pageIndex: 0 }, 0);
    expect(m.pageElements(s, 0).map((e) => e.name)).toEqual(["q2", "q1", "q3"]);
    expect(m.findElement(s, "q1")?.elements).toHaveLength(0);
  });

  it("reorders within the same list (remove-then-insert semantics)", () => {
    const s = m.moveElementTo(base(), "q1", { pageIndex: 0 }, 2);
    expect(m.pageElements(s, 0).map((e) => e.name)).toEqual(["q2", "q3", "q1"]);
  });

  it("moves between groups", () => {
    let s = base();
    s = m.addElement(s, "group").schema; // q4
    s = m.moveElementTo(s, "q2", { pageIndex: 0, parentName: "q1" }, 0);
    s = m.moveElementTo(s, "q2", { pageIndex: 0, parentName: "q4" }, 0);
    expect(m.findElement(s, "q1")?.elements).toHaveLength(0);
    expect(m.findElement(s, "q4")?.elements?.map((e) => e.name)).toEqual(["q2"]);
  });

  it("refuses to drop a container into itself or its descendants", () => {
    let s = base();
    s = m.moveElementTo(s, "q2", { pageIndex: 0, parentName: "q1" }, 0);
    expect(m.moveElementTo(s, "q1", { pageIndex: 0, parentName: "q1" }, 0)).toBe(s);
    // nested group inside q1, then try to drop q1 into it
    s = m.addElement(s, "group", { parentName: "q1" }).schema;
    const nested = m.findElement(s, "q1")?.elements?.find((e) => e.type === "group")?.name;
    expect(m.moveElementTo(s, "q1", { pageIndex: 0, parentName: nested }, 0)).toBe(s);
  });

  it("clamps the index and ignores unknown names", () => {
    const s = m.moveElementTo(base(), "q2", { pageIndex: 0 }, 99);
    expect(m.pageElements(s, 0).map((e) => e.name)).toEqual(["q1", "q3", "q2"]);
    expect(m.moveElementTo(s, "nope", { pageIndex: 0 }, 0)).toBe(s);
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

describe("groupOrJoin (drag-to-group)", () => {
  // Build a flat form with three text questions q1, q2, q3.
  const three = (): FormSchema => {
    let s = empty();
    s = m.addElement(s, "text").schema; // q1
    s = m.addElement(s, "text").schema; // q2
    s = m.addElement(s, "text").schema; // q3
    return s;
  };

  it("wraps two top-level questions into a new group", () => {
    const { schema, groupName } = m.groupOrJoin(three(), "q3", "q1");
    expect(groupName).not.toBe("");
    const group = m.findElement(schema, groupName);
    expect(group?.type).toBe("group");
    const childNames = (group?.elements ?? []).map((c) => c.name).sort();
    expect(childNames).toEqual(["q1", "q3"]);
    // q3 was lifted out of the top level into the group.
    expect(m.pageElements(schema, 0).some((e) => e.name === "q3")).toBe(false);
  });

  it("joins a question into the target's existing group", () => {
    // First make a group of q1 + q2, then drop q3 onto q1 (a child) → joins same group.
    const grouped = m.groupOrJoin(three(), "q2", "q1");
    const { schema, groupName } = m.groupOrJoin(grouped.schema, "q3", "q1");
    expect(groupName).toBe(grouped.groupName); // same group, not a new one
    const group = m.findElement(schema, groupName);
    expect((group?.elements ?? []).map((c) => c.name).sort()).toEqual(["q1", "q2", "q3"]);
    // No nested group was created.
    const nested = (group?.elements ?? []).filter((c) => c.type === "group");
    expect(nested).toHaveLength(0);
  });

  it("is a no-op when source and target are the same", () => {
    const start = three();
    const { schema, groupName } = m.groupOrJoin(start, "q1", "q1");
    expect(groupName).toBe("");
    expect(schema).toBe(start); // same reference back → genuinely unchanged
  });

  it("locate reports page, parent, and index", () => {
    const grouped = m.groupOrJoin(three(), "q2", "q1");
    const loc = m.locate(grouped.schema, "q1");
    expect(loc?.parentName).toBe(grouped.groupName);
    expect(loc?.index).toBe(0);
  });
});
