import { type Member, api } from "@/api/client";
import { useCallback, useEffect, useState } from "react";

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

/**
 * Manage who can collaborate on the form's project. Owners/admins add people by email
 * and pick a role; the owner row is fixed.
 * Role hierarchy: viewer < editor < admin < owner.
 */
export function ShareDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
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

  // Close on Escape so the dialog is dismissible without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-close"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="modal share-dialog">
        <header className="modal-head">
          <h2>Share this project</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </header>

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
    </div>
  );
}
