/**
 * Thin typed fetch client for the Supform API.
 * A fuller client (generated from the backend OpenAPI via orval/openapi-typescript)
 * can replace this in M2 — the surface is kept small and stable on purpose.
 */
import type { FormSchema } from "@/types/form-schema";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
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
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  // forms
  getPublishedSchema: (formId: string) =>
    request<FormSchema>(`/api/v1/forms/${formId}/schema`),

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
