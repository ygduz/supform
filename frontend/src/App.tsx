import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { BuilderPage } from "./features/builder/BuilderPage";
import { RendererPage } from "./features/renderer/RendererPage";
import { ResponsesPage } from "./features/responses/ResponsesPage";

/**
 * App shell + routing. Routes are intentionally minimal in the scaffold; each feature
 * owns its own subtree.
 */
export function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <Link to="/" className="brand">
          Supform
        </Link>
        <nav>
          <Link to="/builder/new">Builder</Link>
          <Link to="/f/demo">Preview</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/builder/:formId" element={<BuilderPage />} />
          <Route path="/f/:formId" element={<RendererPage />} />
          <Route path="/forms/:formId/responses" element={<ResponsesPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

function Home() {
  return (
    <section className="home">
      <h1>Build beautiful forms.</h1>
      <p>As easy as MS Forms, flexible enough to drive from code.</p>
      <Link className="button" to="/builder/new">
        Create a form
      </Link>
    </section>
  );
}
