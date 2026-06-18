import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store autosaves through the API client; mock it before the store module loads.
vi.mock("@/api/client", () => ({
  isAuthenticated: () => true,
  api: {
    listProjects: vi.fn(async () => [{ id: "p1", name: "My forms" }]),
    createProject: vi.fn(async () => ({ id: "p1", name: "My forms" })),
    createForm: vi.fn(async () => ({ id: "form-1" })),
    saveDraft: vi.fn(async () => ({})),
    publish: vi.fn(async () => ({})),
    getForm: vi.fn(),
  },
}));

import { api } from "@/api/client";
import { useBuilderStore } from "./builderStore";

const store = () => useBuilderStore.getState();

describe("builder history (undo/redo)", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await store().init("new");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("undo restores the previous schema and redo reapplies the change", () => {
    // A fresh "new" form is seeded with one starter question, so adding makes two.
    store().add("text");
    const withField = store().schema;
    expect(withField.pages[0].elements).toHaveLength(2);
    expect(store().past.length).toBe(1);

    store().undo();
    expect(store().schema.pages[0].elements).toHaveLength(1);

    store().redo();
    expect(store().schema).toBe(withField);
  });

  it("a new edit clears the redo stack", () => {
    store().add("text");
    store().undo();
    expect(store().future.length).toBe(1);
    store().add("email");
    expect(store().future.length).toBe(0);
  });

  it("undo is a no-op with no history; init clears history", async () => {
    store().undo(); // empty history — nothing happens
    store().add("text");
    await store().init("new");
    expect(store().past).toEqual([]);
    // init("new") re-seeds the single starter question and clears history.
    expect(store().schema.pages[0].elements).toHaveLength(1);
  });
});

describe("builder autosave", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await store().init("new");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("debounces: several quick edits produce one save after the quiet period", async () => {
    store().add("text");
    vi.advanceTimersByTime(1000);
    store().add("email");
    vi.advanceTimersByTime(1000); // first timer was reset; still nothing
    expect(api.createForm).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1100); // quiet period elapses after the last edit
    await vi.runAllTimersAsync();
    expect(api.createForm).toHaveBeenCalledTimes(1);
    expect(store().formId).toBe("form-1");
  });

  it("saves an existing form via saveDraft", async () => {
    store().add("text");
    await vi.runAllTimersAsync(); // first autosave creates the form
    store().setTitle("Renamed");
    await vi.runAllTimersAsync();
    expect(api.saveDraft).toHaveBeenCalled();
    expect(store().dirty).toBe(false);
  });
});
