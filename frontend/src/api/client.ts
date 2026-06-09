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
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
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
};
