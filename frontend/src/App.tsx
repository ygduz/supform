import { isAuthenticated } from "@/api/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage";
import { LoginPage } from "./features/auth/LoginPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./features/auth/VerifyEmailPage";
import { BuilderPage } from "./features/builder/BuilderPage";
import { EmbedPage } from "./features/embed/EmbedPage";
import { FormsPage } from "./features/forms/FormsPage";
import { ImportPage } from "./features/import/ImportPage";
import { OfflineIndicator } from "./features/offline/OfflineIndicator";
import { RendererPage } from "./features/renderer/RendererPage";
import { ResponsesPage } from "./features/responses/ResponsesPage";
import { TemplatesPage } from "./features/templates/TemplatesPage";

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
  const bare = useLocation().pathname.startsWith("/embed/");
  if (bare) {
    return (
      <Routes>
        <Route path="/embed/:formId" element={<EmbedPage />} />
      </Routes>
    );
  }
  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">
          Supform
        </Link>
        <nav>
          <Link to="/forms">My forms</Link>
          <Link to="/templates">Templates</Link>
          <Link to="/builder/new">Builder</Link>
          <Link to="/import">Import</Link>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>
      <OfflineIndicator />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/forms" element={<FormsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/builder/:formId" element={<BuilderPage />} />
          <Route path="/f/:formId" element={<RendererPage />} />
          <Route path="/forms/:formId/responses" element={<ResponsesPage />} />
        </Routes>
      </main>
    </>
  );
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
