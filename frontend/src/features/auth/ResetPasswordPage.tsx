import { api } from "@/api/client";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

/** Set a new password using the token from a reset link (?token=...). */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <section className="auth">
        <h1>Invalid link</h1>
        <p className="muted">This password-reset link is missing its token.</p>
        <Link to="/forgot-password">Request a new link</Link>
      </section>
    );
  }

  if (done) {
    return (
      <section className="auth">
        <h1>Password updated</h1>
        <p className="muted">Your password has been reset.</p>
        <button type="button" className="button" onClick={() => navigate("/login")}>
          Sign in
        </button>
      </section>
    );
  }

  return (
    <form className="auth" onSubmit={onSubmit}>
      <h1>Choose a new password</h1>
      <input
        type="password"
        placeholder="New password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Saving…" : "Reset password"}
      </button>
      <Link to="/login">Back to sign in</Link>
    </form>
  );
}
