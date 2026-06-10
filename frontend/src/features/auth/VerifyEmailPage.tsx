import { api } from "@/api/client";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

type State = "verifying" | "ok" | "error";

/** Confirm an email address from the link sent at signup (?token=...). */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("This verification link is missing its token.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await api.verifyEmail(token);
        if (!cancelled) setState("ok");
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="auth">
      {state === "verifying" && <h1>Verifying your email…</h1>}
      {state === "ok" && (
        <>
          <h1>Email verified ✓</h1>
          <p className="muted">Thanks — your email address is confirmed.</p>
          <Link to="/login">Continue to sign in</Link>
        </>
      )}
      {state === "error" && (
        <>
          <h1>Verification failed</h1>
          <p className="error">{error}</p>
          <Link to="/login">Back to sign in</Link>
        </>
      )}
    </section>
  );
}
