import { type SubmissionRow, api } from "@/api/client";
import type { FormSchema } from "@/types/form-schema";

interface Props {
  schema: FormSchema;
  submissions: SubmissionRow[];
  onUpdate: (sub: SubmissionRow) => void;
}

export function WorkflowBoard({ schema, submissions, onUpdate }: Props) {
  const steps = schema.settings?.workflowSteps ?? [];
  if (steps.length === 0) {
    return (
      <p className="wf-no-steps">No workflow configured. Add steps in the builder Settings tab.</p>
    );
  }

  // Group submissions by step; unassigned go to first step
  const grouped: Record<string, SubmissionRow[]> = {};
  for (const s of steps) grouped[s] = [];
  for (const sub of submissions) {
    const step = sub.workflow_step ?? steps[0];
    if (grouped[step] !== undefined) grouped[step].push(sub);
    else if (steps[0]) grouped[steps[0]].push(sub);
  }

  async function moveTo(sub: SubmissionRow, step: string) {
    const updated = await api.setWorkflowStep(sub.id, step);
    onUpdate(updated);
  }

  return (
    <div className="wf-board">
      {steps.map((step) => (
        <div key={step} className="wf-column">
          <div className="wf-col-header">
            <span className="wf-col-title">{step}</span>
            <span className="wf-col-count">{grouped[step].length}</span>
          </div>
          <div className="wf-cards">
            {grouped[step].map((sub) => (
              <div key={sub.id} className="wf-card">
                <div className="wf-card-id">#{sub.id.slice(0, 8)}</div>
                <div className="wf-card-time">{new Date(sub.created_at).toLocaleDateString()}</div>
                <select
                  className="wf-move-select"
                  value={step}
                  onChange={(e) => moveTo(sub, e.target.value)}
                >
                  {steps.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {grouped[step].length === 0 && <p className="wf-empty-col">Empty</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
