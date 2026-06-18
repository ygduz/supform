import { api } from "@/api/client";
import { Alert, Button, Spinner } from "@/components";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type State = "verifying" | "ok" | "error";

/** Confirm an email address from the link sent at signup (?token=...). */
export function VerifyEmailPage() {
  const navigate = useNavigate();
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
    <div className="auth-page">
      <div className="auth-card">
        {state === "verifying" && (
          <div className="auth-head">
            <Spinner size="md" />
            <h1>Verifying your email…</h1>
          </div>
        )}
        {state === "ok" && (
          <>
            <div className="auth-head">
              <h1>Email verified ✓</h1>
              <p className="auth-sub">Thanks — your email address is confirmed.</p>
            </div>
            <Button variant="primary" className="auth-submit" onClick={() => navigate("/login")}>
              Continue to sign in
            </Button>
          </>
        )}
        {state === "error" && (
          <>
            <div className="auth-head">
              <h1>Verification failed</h1>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Link to="/login" className="link-button">
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
