import { api } from "@/api/client";
import { Alert, Button, Input } from "@/components";
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
      <div className="auth-card">
        <div className="auth-brand">Supform</div>
        <h1 className="auth-title">Invalid link</h1>
        <p className="auth-sub">This password-reset link is missing its token.</p>
        <div className="auth-footer">
          <Link to="/forgot-password">Request a new link</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-card">
        <div className="auth-brand">Supform</div>
        <h1 className="auth-title">Password updated</h1>
        <p className="auth-sub">Your password has been reset successfully.</p>
        <Button
          variant="primary"
          size="lg"
          className="auth-submit"
          onClick={() => navigate("/login")}
        >
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">Supform</div>
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-sub">Pick something strong that you don't use elsewhere.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <Input
          type="password"
          label="New password"
          hint="Minimum 8 characters"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="auth-submit">
          Reset password
        </Button>
      </form>
      <div className="auth-footer">
        <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
