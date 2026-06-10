import type { FormSchema } from "@/types/form-schema";
import { describe, expect, it } from "vitest";
import {
  type KVStorage,
  cacheSchema,
  isNetworkError,
  isRetryable,
  listQueued,
  queueSubmission,
  readCachedSchema,
  syncQueued,
} from "./offline";

/** Mimic the api client's ApiError: an Error carrying an HTTP status. */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

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

  it("a permanent client rejection (422) drops only that item and keeps going", async () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "bad" }, store);
    queueSubmission("form-1", { q: "good" }, store);

    const result = await syncQueued(async (_formId, answers) => {
      if ((answers as { q: string }).q === "bad") throw httpError(422);
    }, store);

    expect(result).toEqual({ sent: 1, rejected: 1, remaining: 0 });
    expect(listQueued(store)).toHaveLength(0);
  });

  it("keeps queued data when the session has expired (401) instead of dropping it", async () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "a" }, store);
    queueSubmission("form-1", { q: "b" }, store);

    const result = await syncQueued(async () => {
      throw httpError(401); // token expired while offline
    }, store);

    expect(result).toEqual({ sent: 0, rejected: 0, remaining: 2 });
    expect(listQueued(store)).toHaveLength(2);
  });

  it("retries on a server error (5xx) rather than discarding the response", async () => {
    const store = memoryStore();
    queueSubmission("form-1", { q: "a" }, store);

    const result = await syncQueued(async () => {
      throw httpError(503);
    }, store);

    expect(result.remaining).toBe(1);
    expect(listQueued(store)).toHaveLength(1);
  });
});

describe("error classification", () => {
  it("isNetworkError matches fetch-level TypeErrors only", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("500"))).toBe(false);
  });

  it("isRetryable keeps network/401/408/429/5xx and drops other 4xx", () => {
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryable(httpError(401))).toBe(true);
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(503))).toBe(true);
    expect(isRetryable(httpError(422))).toBe(false);
    expect(isRetryable(httpError(403))).toBe(false);
    expect(isRetryable(new Error("no status"))).toBe(false);
  });
});
