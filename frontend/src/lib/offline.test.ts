import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import {
  type KVStorage,
  cacheSchema,
  isNetworkError,
  listQueued,
  queueSubmission,
  readCachedSchema,
  syncQueued,
} from "./offline";

function memoryStore(): KVStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const SCHEMA: FormSchema = {
  schemaVersion: "1.0",
  name: "f",
  title: "F",
  pages: [{ name: "p1", elements: [{ type: "text", name: "q" }] }],
};

describe("schema cache", () => {
  it("round-trips a schema per form id", () => {
    const store = memoryStore();
    cacheSchema("form-1", SCHEMA, store);
    expect(readCachedSchema("form-1", store)?.name).toBe("f");
    expect(readCachedSchema("other", store)).toBeNull();
  });
});

describe("submission queue", () => {
  it("queues submissions and lists them oldest first", () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "a" }, store);
    queueSubmission("form-1", { q: "b" }, store);
    const queued = listQueued(store);
    expect(queued).toHaveLength(2);
    expect(queued[0].answers).toEqual({ q: "a" });
    expect(queued[1].formId).toBe("form-1");
  });

  it("sync sends everything and empties the queue when online", async () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "a" }, store);
    queueSubmission("form-2", { q: "b" }, store);

    const sent: string[] = [];
    const result = await syncQueued(async (formId) => {
      sent.push(formId);
    }, store);

    expect(result).toEqual({ sent: 2, rejected: 0, remaining: 0 });
    expect(sent).toEqual(["form-1", "form-2"]);
    expect(listQueued(store)).toHaveLength(0);
  });

  it("a network failure stops the pass and keeps the rest queued", async () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "a" }, store);
    queueSubmission("form-1", { q: "b" }, store);
    queueSubmission("form-1", { q: "c" }, store);

    let calls = 0;
    const result = await syncQueued(async () => {
      calls++;
      if (calls === 2) throw new TypeError("Failed to fetch");
    }, store);

    expect(result).toEqual({ sent: 1, rejected: 0, remaining: 2 });
    const remaining = listQueued(store);
    expect(remaining.map((i) => i.answers)).toEqual([{ q: "b" }, { q: "c" }]);
  });

  it("a server rejection drops the item instead of retrying forever", async () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "bad" }, store);
    queueSubmission("form-1", { q: "good" }, store);

    const result = await syncQueued(async (_formId, answers) => {
      if ((answers as { q: string }).q === "bad") throw new Error("422 validation failed");
    }, store);

    expect(result).toEqual({ sent: 1, rejected: 1, remaining: 0 });
    expect(listQueued(store)).toHaveLength(0);
  });
});

describe("isNetworkError", () => {
  it("matches fetch-level TypeErrors only", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("500"))).toBe(false);
  });
});
