import { ApiError, api } from "@/api/client";
import { useBuilderStore } from "@/stores/builderStore";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const EXAMPLES = [
  "A customer satisfaction survey with a rating and an open comment",
  "A volunteer sign-up: name, email, areas of interest, availability",
  "An event feedback form, one question per screen",
];

/** Prompt → AI-generated draft, seeded into the builder. */
export function AIGenerateDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const loadTemplate = useBuilderStore((s) => s.loadTemplate);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const schema = await api.generateForm(prompt.trim());
      loadTemplate(schema);
      navigate("/builder/new");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError("AI generation isn't enabled on this server yet.");
      } else {
        setError((err as Error).message);
      }
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-close"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="modal ai-dialog">
        <header className="modal-head">
          <h2>✨ Generate a form with AI</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="muted">Describe the form you need and we'll draft it for you to refine.</p>
        <textarea
          className="ai-prompt"
          rows={4}
          placeholder="e.g. A job application with name, email, role, and a CV upload"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: a prompt dialog should focus its input
          autoFocus
        />
        <div className="ai-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setPrompt(ex)}>
              {ex}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button
          type="button"
          className="button"
          onClick={generate}
          disabled={busy || !prompt.trim()}
        >
          {busy ? "Generating…" : "Generate form"}
        </button>
      </div>
    </div>
  );
}
