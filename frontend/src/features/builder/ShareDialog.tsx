import { type Member, api } from "@/api/client";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  viewer: "Can view responses",
  editor: "Can build, publish, and manage responses",
  admin: "Editor + can invite and remove members",
};

type ShareTab = "link" | "people";

/** Distribution options for a published form: public link, embed snippet, scannable QR. */
export function LinkTab({ formId }: { formId: string }) {
  const origin = window.location.origin;
  const link = `${origin}/f/${formId}`;
  const embed = `<div data-supform="${formId}"></div>\n<script src="${origin}/embed.js" async></script>`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, link, { width: 160, margin: 1 }).catch(() => {});
    }
  }, [link]);

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="share-link-dialog">
      <label className="prop">
        <span>Public link</span>
        <div className="copy-row">
          <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={() => copy(link, "link")}>
            {copied === "link" ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </label>

      <label className="prop">
        <span>Embed on your site</span>
        <textarea className="embed-snippet" readOnly rows={3} value={embed} />
        <button type="button" className="link-button" onClick={() => copy(embed, "embed")}>
          {copied === "embed" ? "Copied ✓" : "Copy embed code"}
        </button>
      </label>

      <div className="prop qr-block">
        <span>QR code</span>
        <canvas ref={canvasRef} className="qr-canvas" />
      </div>
    </div>
  );
}

/**
 * Collaborator management for the form's project. Owners/admins add people by email
 * and pick a role; the owner row is fixed.
 * Role hierarchy: viewer < editor < admin < owner.
 */
export function PeopleTab({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMembers(await api.listMembers(projectId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addMember(projectId, email.trim(), role);
      setEmail("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRole(userId: string, nextRole: string) {
    setError(null);
    try {
      await api.updateMember(projectId, userId, nextRole);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onRemove(userId: string) {
    setError(null);
    try {
      await api.removeMember(projectId, userId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <p className="muted">People you add here can collaborate on every form in this project.</p>

      <form className="share-add" onSubmit={onAdd}>
        <input
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Collaborator email"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="button" disabled={busy || !email.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      {ROLE_DESCRIPTIONS[role] && <p className="role-hint muted">{ROLE_DESCRIPTIONS[role]}</p>}

      {error && <p className="error">{error}</p>}

      <ul className="member-list">
        {members.map((m) => (
          <li key={m.user_id} className="member-row">
            <span className="member-email">{m.email}</span>
            {m.role === "owner" ? (
              <span className="member-role muted">{ROLE_LABELS.owner}</span>
            ) : (
              <>
                <select
                  value={m.role}
                  onChange={(e) => onChangeRole(m.user_id, e.target.value)}
                  aria-label={`Role for ${m.email}`}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="button" className="link-button" onClick={() => onRemove(m.user_id)}>
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  /** Public-link distribution is available once the form is saved. */
  formId?: string;
  /** Collaborator management is available once the form belongs to a project. */
  projectId?: string;
  /** Which tab to open on first render. Falls back to whichever tab is available. */
  initialTab?: ShareTab;
  onClose: () => void;
}

/**
 * Unified Share dialog. Two tabs behind one entry point:
 *   • Link — public link, embed snippet, QR code (needs a saved form).
 *   • People — project collaborators and their roles (needs a project).
 */
export function ShareDialog({ formId, projectId, initialTab, onClose }: Props) {
  const canLink = !!formId;
  const canPeople = !!projectId;
  const defaultTab: ShareTab = initialTab ?? (canLink ? "link" : "people");
  const [tab, setTab] = useState<ShareTab>(defaultTab);

  // Close on Escape so the dialog is dismissible without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active =
    tab === "link" && canLink ? "link" : tab === "people" && canPeople ? "people" : tab;

  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-close"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="modal share-dialog">
        <header className="modal-head">
          <h2>Share</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </header>

        {canLink && canPeople && (
          <div className="share-tabs">
            <button
              type="button"
              className={active === "link" ? "tab active" : "tab"}
              onClick={() => setTab("link")}
            >
              Link
            </button>
            <button
              type="button"
              className={active === "people" ? "tab active" : "tab"}
              onClick={() => setTab("people")}
            >
              People
            </button>
          </div>
        )}

        {active === "link" && canLink && <LinkTab formId={formId as string} />}
        {active === "people" && canPeople && <PeopleTab projectId={projectId as string} />}
      </div>
    </div>
  );
}
