/**
 * Thin typed fetch client for the Supform API.
 * A fuller client (generated from the backend OpenAPI via orval/openapi-typescript)
 * can replace this in M2 — the surface is kept small and stable on purpose.
 */
import type { FormSchema } from "@/types/form-schema";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// The access token is persisted to localStorage so a builder session survives a reload.
const TOKEN_KEY = "supform.token";

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private mode / storage disabled — fall back to in-memory only
  }
}

let accessToken: string | null = readStoredToken();

export function setAccessToken(token: string | null) {
  accessToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage failures */
  }
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

/** Error carrying the HTTP status and any structured `error.details` from the API. */
export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body?.error?.message ?? `Request failed: ${res.status}`,
      res.status,
      body?.error?.details,
    );
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface SubmissionRow {
  id: string;
  form_version: number;
  answers: Record<string, unknown>;
  created_at: string;
}

/** Reference a file field stores as its answer after upload. */
export interface MediaRef {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

export const api = {
  // auth
  signup: (email: string, password: string, fullName?: string) =>
    request<{ id: string; email: string }>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName ?? null }),
    }),

  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  // projects
  listProjects: () => request<Array<{ id: string; name: string }>>("/api/v1/projects"),

  createProject: (name: string) =>
    request<{ id: string; name: string }>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  // forms
  getPublishedSchema: (formId: string) => request<FormSchema>(`/api/v1/forms/${formId}/schema`),

  getForm: (formId: string) =>
    request<{ id: string; draft_content: FormSchema; status: string }>(`/api/v1/forms/${formId}`),

  createForm: (projectId: string, content: FormSchema) =>
    request<{ id: string }>("/api/v1/forms", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, content }),
    }),

  saveDraft: (formId: string, content: FormSchema) =>
    request(`/api/v1/forms/${formId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  publish: (formId: string) =>
    request<{ form_id: string; version: number }>(`/api/v1/forms/${formId}/publish`, {
      method: "POST",
    }),

  // submissions
  submit: (formId: string, answers: Record<string, unknown>) =>
    request(`/api/v1/forms/${formId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  listSubmissions: (formId: string) =>
    request<SubmissionRow[]>(`/api/v1/forms/${formId}/submissions?limit=500`),

  /** Upload a file for a file/image field; returns the reference to store as the answer. */
  uploadFile: async (formId: string, file: File): Promise<MediaRef> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${BASE}/api/v1/forms/${formId}/uploads`, {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(
        err?.error?.message ?? `Upload failed: ${res.status}`,
        res.status,
        err?.error?.details,
      );
    }
    return res.json();
  },

  /** Fetch an export with auth and return the blob + server-suggested filename. */
  exportSubmissions: async (
    formId: string,
    format: "csv" | "xlsx" | "json",
  ): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${BASE}/api/v1/forms/${formId}/export?format=${format}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        body?.error?.message ?? `Export failed: ${res.status}`,
        res.status,
        body?.error?.details,
      );
    }
    const blob = await res.blob();
    const match = (res.headers.get("Content-Disposition") ?? "").match(/filename="?([^"]+)"?/);
    return { blob, filename: match?.[1] ?? `submissions.${format}` };
  },
};
