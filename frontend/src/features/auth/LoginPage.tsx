import { api, setAccessToken } from "@/api/client";
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
    <form className="auth" onSubmit={onSubmit}>
      <h1>{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
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
          Forgot your password?
        </Link>
      )}
    </form>
  );
}
