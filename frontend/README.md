# Supform Frontend

React + TypeScript + Vite. Three feature areas, all driven by the shared **Form Schema**:

| Feature | What it does |
|---|---|
| `features/builder` | Drag-and-drop form designer — edits a `FormSchema` with live preview and a logic editor. The "easy as MS Forms" experience. |
| `features/renderer` | Takes a published `FormSchema` and renders an interactive, validated, themeable form for respondents. |
| `features/responses` | Results table, per-question summaries, charts, and exports. |
| `features/auth` | Login / signup. |

## Structure

```
src/
  main.tsx, App.tsx       app entry + routing
  types/form-schema.ts    TS mirror of packages/form-schema (the contract)
  api/                    typed client for the FastAPI backend
  components/             shared design-system components
  features/               builder | renderer | responses | auth
  stores/                 Zustand stores
  theme/                  design tokens — forms are themeable & beautiful
```

## Run

```bash
npm install
npm run dev   # http://localhost:5173  (expects backend at VITE_API_BASE_URL)
```

## The contract

`src/types/form-schema.ts` mirrors `packages/form-schema/schema/form.schema.json`. When
the form model changes, update the JSON Schema, the backend Pydantic models, this file,
and the SDK together.
