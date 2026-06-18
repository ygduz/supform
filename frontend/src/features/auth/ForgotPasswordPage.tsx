import { api } from "@/api/client";
import { Alert, Button, Input } from "@/components";
import { useState } from "react";
import { Link } from "react-router-dom";

/** Request a password-reset link. The response is intentionally generic (no account leak). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-card">
        <div className="auth-brand">Supform</div>
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-sub">
          If an account exists for <strong>{email}</strong>, we've sent a link to reset your
          password. The link expires in 30 minutes.
        </p>
        <div className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">Supform</div>
      <h1 className="auth-title">Reset your password</h1>
      <p className="auth-sub">Enter your email and we'll send you a reset link.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <Input
          type="email"
          label="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="auth-submit">
          Send reset link
        </Button>
      </form>
      <div className="auth-footer">
        <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
