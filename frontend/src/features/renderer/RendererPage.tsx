import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { FormRenderer } from "./FormRenderer";

/** Loads a published form schema by id and renders it for a respondent. */
export function RendererPage() {
  const { formId = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["form-schema", formId],
    queryFn: () => api.getPublishedSchema(formId),
    enabled: formId !== "demo",
  });

  if (formId === "demo") return <FormRenderer schema={DEMO} formId="demo" />;
  if (isLoading) return <p>Loading…</p>;
  if (error || !data) return <p>Could not load this form.</p>;
  return <FormRenderer schema={data} formId={formId} />;
}

// A tiny built-in demo so the renderer is viewable without a backend.
const DEMO = {
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
} as const;
