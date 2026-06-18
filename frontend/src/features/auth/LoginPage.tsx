import { api, setAccessToken } from "@/api/client";
import { Alert, Button, Input } from "@/components";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/** Sign in (or create an account), then return to the builder. */
export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await api.signup(email, password);
      }
      const { access_token } = await api.login(email, password);
      setAccessToken(access_token);
      navigate("/forms");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-head">
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="auth-sub">
            {mode === "login"
              ? "Sign in to your Supform account"
              : "It only takes a minute to get started"}
          </p>
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
        <Input
          label="Password"
          type="password"
          placeholder="Min 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        <Button type="submit" variant="primary" loading={busy} className="auth-submit">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <div className="auth-footer">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setError(null);
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          {mode === "login" && (
            <Link to="/forgot-password" className="muted">
              Forgot password?
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
