import { api } from "@/api/client";
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
      <section className="auth">
        <h1>Check your email</h1>
        <p className="muted">
          If an account exists for <strong>{email}</strong>, we've sent a link to reset your
          password. The link expires in 30 minutes.
        </p>
        <Link to="/login">Back to sign in</Link>
      </section>
    );
  }

  return (
    <form className="auth" onSubmit={onSubmit}>
      <h1>Reset your password</h1>
      <p className="muted">Enter your email and we'll send you a reset link.</p>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <Link to="/login">Back to sign in</Link>
    </form>
  );
}
