/**
 * Offline collection support: a cache of published form schemas and a queue of
 * submissions made while offline, flushed when connectivity returns.
 *
 * Storage is injectable (defaults to localStorage) so the logic is testable in node
 * and degrades gracefully when storage is unavailable (private mode).
 */
import type { FormSchema } from "@/types/form-schema";

export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SCHEMA_PREFIX = "supform.offline.schema.";
const QUEUE_KEY = "supform.offline.queue";

function defaultStorage(): KVStorage | null {
  try {
    const probe = "__supform_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null; // SSR, tests without jsdom, or storage disabled
  }
}

/** True for fetch-level failures (no response at all), as opposed to API errors. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

// ---- schema cache ----

export function cacheSchema(formId: string, schema: FormSchema, store = defaultStorage()): void {
  store?.setItem(SCHEMA_PREFIX + formId, JSON.stringify(schema));
}

export function readCachedSchema(formId: string, store = defaultStorage()): FormSchema | null {
  const raw = store?.getItem(SCHEMA_PREFIX + formId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FormSchema;
  } catch {
    return null;
  }
}

// ---- submission queue ----

export interface QueuedSubmission {
  id: string;
  formId: string;
  answers: Record<string, unknown>;
  queuedAt: string;
}

export function listQueued(store = defaultStorage()): QueuedSubmission[] {
  const raw = store?.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedSubmission[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedSubmission[], store: KVStorage | null): void {
  if (!store) return;
  if (queue.length === 0) store.removeItem(QUEUE_KEY);
  else store.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function queueSubmission(
  formId: string,
  answers: Record<string, unknown>,
  store = defaultStorage(),
): QueuedSubmission {
  const item: QueuedSubmission = {
    id: crypto.randomUUID(),
    formId,
    answers,
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...listQueued(store), item], store);
  return item;
}

export interface SyncResult {
  sent: number;
  rejected: number; // server refused (e.g. validation/closed) — dropped, retrying won't help
  remaining: number; // still queued (network unavailable)
}

/**
 * Try to deliver every queued submission, oldest first.
 *
 * A network failure stops the pass (still offline) and keeps the rest queued. A server
 * rejection drops the item: the response reached the server and was refused, so a retry
 * would only fail the same way.
 */
export async function syncQueued(
  submit: (formId: string, answers: Record<string, unknown>) => Promise<unknown>,
  store = defaultStorage(),
): Promise<SyncResult> {
  const queue = listQueued(store);
  const result: SyncResult = { sent: 0, rejected: 0, remaining: 0 };
  const keep: QueuedSubmission[] = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await submit(item.formId, item.answers);
      result.sent++;
    } catch (err) {
      if (isNetworkError(err)) {
        keep.push(...queue.slice(i)); // still offline; keep this and everything after
        break;
      }
      result.rejected++;
    }
  }

  result.remaining = keep.length;
  writeQueue(keep, store);
  return result;
}
