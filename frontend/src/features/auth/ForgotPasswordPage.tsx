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
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-head">
            <h1>Check your email</h1>
            <p className="auth-sub">
              If an account exists for <strong>{email}</strong>, we've sent a reset link. It expires
              in 30 minutes.
            </p>
          </div>
          <Link to="/login" className="link-button">
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-head">
          <h1>Reset your password</h1>
          <p className="auth-sub">Enter your email and we'll send you a reset link.</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Button type="submit" variant="primary" loading={busy} className="auth-submit">
          Send reset link
        </Button>
        <Link to="/login" className="link-button">
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
}
