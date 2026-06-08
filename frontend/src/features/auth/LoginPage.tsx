import { useState } from "react";
import { api, setAccessToken } from "@/api/client";

/** Minimal login form. Hooks into POST /api/v1/auth/login. */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { access_token } = await api.login(email, password);
      setAccessToken(access_token);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="auth" onSubmit={onSubmit}>
      <h1>Sign in</h1>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="button">Sign in</button>
    </form>
  );
}
