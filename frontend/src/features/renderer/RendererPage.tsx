import { api, isAuthenticated } from "@/api/client";
import { localize } from "@/lib/i18n";
import { cacheSchema, isNetworkError, readCachedSchema } from "@/lib/offline";
import type { FormSchema } from "@/types/form-schema";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { FormRenderer } from "./FormRenderer";

const isClosed = (closeDate?: string): boolean =>
  closeDate ? new Date(closeDate).getTime() < Date.now() : false;

/**
 * Loads a published form schema by id and renders it for a respondent.
 *
 * Every successful load caches the schema locally, so a previously opened form keeps
 * working offline; offline submissions queue for sync (see lib/offline).
 */
export function RendererPage() {
  const { formId = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["form-schema", formId],
    queryFn: async () => {
      try {
        const schema = await api.getPublishedSchema(formId);
        cacheSchema(formId, schema);
        return schema;
      } catch (err) {
        // Offline? Fall back to the last schema this device saw for the form.
        const cached = isNetworkError(err) ? readCachedSchema(formId) : null;
        if (cached) return cached;
        throw err;
      }
    },
    enabled: formId !== "demo",
  });

  if (formId === "demo") return <FormRenderer schema={DEMO} formId="demo" />;
  if (isLoading) return <FormSkeleton />;
  if (error || !data)
    return (
      <div className="fr-page">
        <div className="form-load-error">
          <span className="form-load-error-icon" aria-hidden="true">
            ⚠
          </span>
          <h2>Couldn't load this form</h2>
          <p className="muted">Check your connection and try again, or contact the form owner.</p>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );

  const settings = data.settings;
  if (isClosed(settings?.closeDate)) {
    return (
      <section className="form-gate">
        <h1>{localize(data.title) || "Form"}</h1>
        <p className="muted">This form is closed and no longer accepting responses.</p>
      </section>
    );
  }
  if (settings?.requireLogin && !isAuthenticated()) {
    return (
      <section className="form-gate">
        <h1>Sign in required</h1>
        <p className="muted">
          This form requires you to <Link to="/login">sign in</Link> before responding.
        </p>
      </section>
    );
  }

  return <FormRenderer schema={data} formId={formId} />;
}

function FormSkeleton() {
  return (
    <div className="fr-page">
      <div className="form-skeleton">
        <div className="form-skeleton-card form-skeleton-title">
          <div className="skel skel-band" />
          <div className="skel-body">
            <div className="skel skel-h1" />
            <div className="skel skel-line" style={{ width: "70%" }} />
            <div className="skel skel-line" style={{ width: "50%" }} />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="form-skeleton-card">
            <div className="skel skel-label" style={{ width: `${40 + i * 15}%` }} />
            <div className="skel skel-input" />
          </div>
        ))}
        <div className="form-skeleton-card form-skeleton-submit">
          <div className="skel skel-btn" />
        </div>
      </div>
    </div>
  );
}

// A tiny built-in demo so the renderer is viewable without a backend.
const DEMO: FormSchema = {
  schemaVersion: "1.0",
  name: "demo",
  title: "Quick feedback",
  pages: [
    {
      name: "main",
      elements: [
        { type: "text", name: "name", label: "Your name", required: true },
        {
          type: "rating",
          name: "score",
          label: "How was it?",
          options: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }],
        },
        {
          type: "longtext",
          name: "why",
          label: "Why?",
          visibleIf: "score <= 3",
          placeholder: "Tell us what went wrong…",
        },
      ],
    },
  ],
};
