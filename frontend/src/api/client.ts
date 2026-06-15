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

export type ValidationStatus = "approved" | "not_approved" | "on_hold";

export interface SubmissionRow {
  id: string;
  form_version: number;
  answers: Record<string, unknown>;
  created_at: string;
  validation_status: ValidationStatus | null;
  quality_flags: string[];
  started_at?: string;
}

/** Reference a file field stores as its answer after upload. */
export interface MediaRef {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

/** A collaborator on a project and their role. */
export interface Member {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

/** A form as listed on the dashboard. */
export interface FormListItem {
  id: string;
  project_id: string;
  name: string;
  title: string;
  status: string;
  current_version: number | null;
  created_at: string;
  updated_at: string;
  response_count: number;
}

/** An outbound webhook registered on a form. */
export interface Webhook {
  id: string;
  form_id: string;
  url: string;
  event: string;
  active: boolean;
  secret: string;
  created_at: string;
}

/** A single webhook delivery attempt (success or failure). */
export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  url: string;
  status_code: number | null;
  error: string | null;
  duration_ms: number | null;
  is_test: boolean;
  created_at: string;
}

export interface QuestionTemplate {
  id: string;
  label: string;
  element: Record<string, unknown>;
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

  verifyEmail: (token: string) =>
    request<{ id: string; email: string; is_verified: boolean }>("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  forgotPassword: (email: string) =>
    request<{ detail: string }>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ detail: string }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  // ai
  generateForm: (prompt: string) =>
    request<FormSchema>("/api/v1/ai/generate-form", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),

  aiTranslate: (texts: string[], sourceLang: string, targetLang: string) =>
    request<{ translations: string[] }>("/api/v1/ai/translate", {
      method: "POST",
      body: JSON.stringify({ texts, sourceLang, targetLang }),
    }),

  // projects
  listProjects: () => request<Array<{ id: string; name: string }>>("/api/v1/projects"),

  createProject: (name: string) =>
    request<{ id: string; name: string }>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  // project members / sharing
  listMembers: (projectId: string) => request<Member[]>(`/api/v1/projects/${projectId}/members`),

  addMember: (projectId: string, email: string, role: string) =>
    request<Member>(`/api/v1/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  updateMember: (projectId: string, userId: string, role: string) =>
    request<Member>(`/api/v1/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeMember: (projectId: string, userId: string) =>
    request<void>(`/api/v1/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    }),

  // forms
  listForms: () => request<FormListItem[]>("/api/v1/forms"),

  duplicateForm: (formId: string) =>
    request<{ id: string }>(`/api/v1/forms/${formId}/duplicate`, { method: "POST" }),

  deleteForm: (formId: string) => request<void>(`/api/v1/forms/${formId}`, { method: "DELETE" }),

  getPublishedSchema: (formId: string) => request<FormSchema>(`/api/v1/forms/${formId}/schema`),

  getForm: (formId: string) =>
    request<{ id: string; project_id: string; draft_content: FormSchema; status: string }>(
      `/api/v1/forms/${formId}`,
    ),

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

  // webhooks / integrations
  listWebhooks: (formId: string) => request<Webhook[]>(`/api/v1/forms/${formId}/webhooks`),

  createWebhook: (formId: string, url: string) =>
    request<Webhook>(`/api/v1/forms/${formId}/webhooks`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  updateWebhook: (formId: string, webhookId: string, patch: { active?: boolean; url?: string }) =>
    request<Webhook>(`/api/v1/forms/${formId}/webhooks/${webhookId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteWebhook: (formId: string, webhookId: string) =>
    request<void>(`/api/v1/forms/${formId}/webhooks/${webhookId}`, {
      method: "DELETE",
    }),

  listWebhookDeliveries: (formId: string, webhookId: string) =>
    request<WebhookDelivery[]>(`/api/v1/forms/${formId}/webhooks/${webhookId}/deliveries`),

  testWebhook: (formId: string, webhookId: string) =>
    request<WebhookDelivery>(`/api/v1/forms/${formId}/webhooks/${webhookId}/test`, {
      method: "POST",
    }),

  // submissions
  submit: (formId: string, answers: Record<string, unknown>, metadata?: Record<string, unknown>) =>
    request(`/api/v1/forms/${formId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ answers, metadata: metadata ?? {} }),
    }),

  listSubmissions: (formId: string) =>
    request<SubmissionRow[]>(`/api/v1/forms/${formId}/submissions?limit=500`),

  setValidationStatus: (formId: string, submissionId: string, status: ValidationStatus | null) =>
    request<SubmissionRow>(`/api/v1/forms/${formId}/submissions/${submissionId}/validation`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  exportMediaZip: async (formId: string): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${BASE}/api/v1/forms/${formId}/export/media`, {
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
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = cd.match(/filename="([^"]+)"/);
    return { blob, filename: match?.[1] ?? "media.zip" };
  },

  editSubmission: (formId: string, submissionId: string, answers: Record<string, unknown>) =>
    request<SubmissionRow>(`/api/v1/forms/${formId}/submissions/${submissionId}`, {
      method: "PATCH",
      body: JSON.stringify({ answers }),
    }),

  deleteSubmission: (formId: string, submissionId: string) =>
    request<void>(`/api/v1/forms/${formId}/submissions/${submissionId}`, { method: "DELETE" }),

  /** Import an XLSForm or ODK XForm file into a new draft form on a project. */
  importForm: async (
    kind: "xlsform" | "xform",
    projectId: string,
    file: File,
  ): Promise<{ id: string }> => {
    const body = new FormData();
    body.append("project_id", projectId);
    body.append("file", file);
    const res = await fetch(`${BASE}/api/v1/imports/${kind}`, {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(
        err?.error?.message ?? `Import failed: ${res.status}`,
        res.status,
        err?.error?.details,
      );
    }
    return res.json();
  },

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

  /** Question library */
  listQuestionTemplates: (): Promise<QuestionTemplate[]> => request("/api/v1/question-library"),

  createQuestionTemplate: (
    label: string,
    element: Record<string, unknown>,
  ): Promise<QuestionTemplate> =>
    request("/api/v1/question-library", {
      method: "POST",
      body: JSON.stringify({ label, element }),
    }),

  deleteQuestionTemplate: (id: string): Promise<void> =>
    request(`/api/v1/question-library/${id}`, { method: "DELETE" }),

  /** Fetch an export with auth and return the blob + server-suggested filename. */
  exportSubmissions: async (
    formId: string,
    format: "csv" | "xlsx" | "json" | "geojson" | "kml" | "spss",
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
