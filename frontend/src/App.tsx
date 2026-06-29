import { isAuthenticated } from "@/api/client";
import { Suspense, lazy } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { LoginPage } from "./features/auth/LoginPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./features/auth/VerifyEmailPage";
import { FormsPage } from "./features/forms/FormsPage";
import { InboxPage } from "./features/inbox/InboxPage";
import { OfflineIndicator } from "./features/offline/OfflineIndicator";
import { TemplatesPage } from "./features/templates/TemplatesPage";

// Heavy, route-specific surfaces (dnd-kit builder, chart/PDF reports, the renderer,
// the Word/Excel importer) are code-split so they don't weigh down first paint —
// each loads only when its route is visited.
const BuilderPage = lazy(() =>
  import("./features/builder/BuilderPage").then((m) => ({ default: m.BuilderPage })),
);
const EmbedPage = lazy(() =>
  import("./features/embed/EmbedPage").then((m) => ({ default: m.EmbedPage })),
);
const ImportPage = lazy(() =>
  import("./features/import/ImportPage").then((m) => ({ default: m.ImportPage })),
);
const RendererPage = lazy(() =>
  import("./features/renderer/RendererPage").then((m) => ({ default: m.RendererPage })),
);
const ResponsesPage = lazy(() =>
  import("./features/responses/ResponsesPage").then((m) => ({ default: m.ResponsesPage })),
);

/**
 * App shell + routing. Routes are intentionally minimal in the scaffold; each feature
 * owns its own subtree. Embedded forms (`/embed/:id`) render bare, without app chrome.
 */
export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const path = useLocation().pathname;
  // Respondent-facing surfaces render bare — no owner chrome leaks onto a public form.
  const bare = path.startsWith("/embed/") || path.startsWith("/f/");
  if (bare) {
    return (
      <Suspense fallback={<div className="route-loading" />}>
        <Routes>
          <Route path="/embed/:formId" element={<EmbedPage />} />
          <Route path="/f/:formId" element={<RendererPage />} />
        </Routes>
      </Suspense>
    );
  }
  const authed = isAuthenticated();
  return (
    <>
      <header className="app-header">
        <Link to={authed ? "/forms" : "/"} className="brand">
          Supform
        </Link>
        <nav>
          {authed ? (
            <>
              <Link to="/forms">My forms</Link>
              <Link to="/templates">Templates</Link>
              <Link to="/inbox">Inbox</Link>
              <Link to="/builder/new" className="button">
                + New form
              </Link>
            </>
          ) : (
            <>
              <Link to="/templates">Templates</Link>
              <Link to="/login">Sign in</Link>
            </>
          )}
        </nav>
      </header>
      <OfflineIndicator />
      <main className="app-main">
        <Suspense fallback={<div className="route-loading" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/forms" element={<FormsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/builder/:formId" element={<BuilderPage />} />
            <Route path="/forms/:formId/responses" element={<ResponsesPage />} />
            {/* The report is now a tab inside Responses; keep the old URL working. */}
            <Route path="/forms/:formId/report" element={<ReportRedirect />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

/** The standalone report page was folded into the Responses view; redirect old links. */
function ReportRedirect() {
  const { formId } = useParams();
  return <Navigate to={`/forms/${formId}/responses?view=report`} replace />;
}

function Home() {
  // Signed-in users land on their dashboard; the marketing splash is for visitors.
  if (isAuthenticated()) return <Navigate to="/forms" replace />;
  return (
    <section className="home">
      <h1>Build beautiful forms.</h1>
      <p>As easy as MS Forms, flexible enough to drive from code.</p>
      <div className="home-actions">
        <Link className="button" to="/templates">
          Browse templates
        </Link>
        <Link className="button secondary" to="/builder/new">
          Start from scratch
        </Link>
      </div>
    </section>
  );
}
