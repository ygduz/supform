import { api } from "@/api/client";
import { Alert, Spinner } from "@/components";
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
    <div className="auth-card">
      <div className="auth-brand">Supform</div>
      {state === "verifying" && (
        <>
          <h1 className="auth-title">Verifying your email…</h1>
          <Spinner size="md" />
        </>
      )}
      {state === "ok" && (
        <>
          <h1 className="auth-title">Email verified ✓</h1>
          <p className="auth-sub">Thanks — your email address is confirmed.</p>
          <div className="auth-footer">
            <Link to="/login">Continue to sign in</Link>
          </div>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="auth-title">Verification failed</h1>
          <Alert tone="danger">{error}</Alert>
          <div className="auth-footer">
            <Link to="/login">Back to sign in</Link>
          </div>
        </>
      )}
    </div>
  );
}
