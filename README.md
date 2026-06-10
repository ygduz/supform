# Supform

> An open-source form & survey platform — **as easy as Microsoft Forms, more flexible than
> KoboToolbox, and drivable entirely from code.**

Build beautiful forms in a drag-and-drop builder **or** define them in Python, collect
responses online **and offline**, review and approve them, and own all of your data.
Self-host it for free — including the AI.

[![CI](https://github.com/ygduz/supform/actions/workflows/backend.yml/badge.svg)](https://github.com/ygduz/supform/actions)
&nbsp;License: [MIT](./LICENSE)

<!-- TODO(launch): add screenshots/GIFs of the builder, a paged form, the analytics & map views. -->

## Why Supform?

| | MS Forms | KoboToolbox | **Supform** |
|---|:---:|:---:|:---:|
| Beautiful, easy UI | ✅ | ⚠️ | ✅ |
| Open source & self-hostable | ❌ | ✅ | ✅ |
| Flexible JSON form model | ❌ | ⚠️ (XLSForm) | ✅ |
| Define forms **in code** (Python SDK) | ❌ | ⚠️ | ✅ |
| Conditional logic, calculations, cascading selects | ⚠️ | ✅ | ✅ |
| Paged / one-question-per-screen, themes | ✅ | ⚠️ | ✅ |
| **AI form generation** (bring your own / local model) | ⚠️ | ❌ | ✅ |
| XLSForm / ODK import | ❌ | ✅ (native) | ✅ (import) |
| Offline / PWA collection | ❌ | ✅ | ✅ |
| Record validation / approval workflow | ❌ | ✅ | ✅ |
| Geopoint questions + map view | ❌ | ✅ | ✅ |
| Repeats, exports (CSV/XLSX long-format/JSON) | ⚠️ | ✅ | ✅ |
| Embeds, prefill, QR, quizzes & scoring | ⚠️ | ❌ | ✅ |
| Webhooks, email notifications, sharing/roles | ⚠️ | ✅ | ✅ |
| Modern async API | ❌ | ❌ (Django) | ✅ (FastAPI) |
| License | proprietary | AGPL | **MIT** |

## Features

- **Builder** — drag-and-drop, live preview, autosave, undo/redo, theme presets, multi-page,
  groups/repeats/matrix, a logic & validation editor, and JSON import/export.
- **Renderer** — schema-driven, themeable, multi-language with a language switcher, paged or
  one-question-per-screen with progress, welcome/thank-you screens, client + server validation.
- **Collect anywhere** — installable PWA; previously-opened forms work offline and submissions
  queue locally, then auto-sync on reconnect.
- **Question types** — text, choice, dropdown, boolean, rating, scale, matrix, date/time,
  number, file/image upload, **geopoint**, hidden, calculated, and more.
- **Manage responses** — analytics (charts, numeric stats, responses-over-time), a **map** of
  geopoint answers, a table with **validation statuses** (approve / on-hold / reject), filters,
  and CSV / XLSX (long-format repeats) / JSON exports.
- **Integrate** — signed **webhooks**, **email notifications**, embeddable iframe + `embed.js`,
  URL **prefill**, **QR** share, project **sharing & roles** (viewer / editor / owner).
- **AI** — generate a draft form from a prompt, using Claude **or any OpenAI-compatible model,
  including a local one via Ollama** (no key, no cloud — see below).
- **Code-first** — a Python SDK builds the exact same schema as the UI; one JSON Schema is the
  single source of truth across UI, API, and SDK.
- **Interoperable** — import **XLSForm** and **ODK XForm** definitions.

## Quick start

```bash
git clone https://github.com/ygduz/supform.git && cd supform
cp .env.example .env
docker compose up --build
# Frontend → http://localhost:5173   ·   API → http://localhost:8000 (/docs for OpenAPI)

# First time only: apply migrations
docker compose exec backend alembic upgrade head
```

Sign up, then create a form from a template, the AI prompt, or from scratch.

### Drive it from code

```python
from supform_sdk import Client, Form, fields

client = Client("http://localhost:8000")
client.login("you@example.com", "password")
project = client.create_project("Research")

form = Form("nps", title="How are we doing?")
form.add(
    fields.SingleChoice("recommend", label="Would you recommend us?", options=["Yes", "No"]),
    fields.LongText("why", label="Why?"),
)
form.publish(client, project_id=project["id"])
```

### AI — free and self-hosted (optional)

AI generation is **off by default** (so it costs nothing and behaves exactly like Kobo until
you enable it). When you do enable it, point Supform at **a local model so it stays free and
private**:

```bash
ollama pull llama3.1 && ollama serve
# in .env:
SUPFORM_AI_PROVIDER=openai
SUPFORM_AI_MODEL=llama3.1
SUPFORM_AI_BASE_URL=http://localhost:11434/v1/chat/completions
```

Or use Claude (`SUPFORM_AI_API_KEY=sk-ant-…`). To try the whole flow with **no model at all**,
run the bundled mock: `python scripts/mock_ai.py` (see `.env.example`).

## Architecture

```
┌──────────────┐     ┌───────────────────────┐     ┌──────────────┐
│  frontend/   │ ──► │      backend/         │ ──► │  PostgreSQL  │
│ React + Vite │ API │ FastAPI + SQLAlchemy  │     │ (JSONB forms)│
│  builder &   │     │   form_engine/        │     └──────────────┘
│  renderer    │     │   importers (ODK)     │     ┌──────────────┐
└──────────────┘     │   exporters (csv/xlsx)│ ──► │ Redis/Celery │
        ▲            └───────────┬───────────┘     │ (async jobs) │
        │                        ▼                 └──────────────┘
┌──────────────┐        ┌──────────────────┐
│  sdk/python  │ ─────► │  packages/        │  ← one JSON Schema is the single source of
│ code-first   │  uses  │  form-schema/     │     truth for the form format (UI/API/SDK)
└──────────────┘        └──────────────────┘
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`docs/`](./docs) for the full design.

| Path | What it is |
|---|---|
| [`backend/`](./backend) | FastAPI + SQLAlchemy API, form engine, importers/exporters, AI |
| [`frontend/`](./frontend) | React + TypeScript (Vite) — builder, renderer, results, maps |
| [`sdk/python/`](./sdk/python) | Python SDK for defining & managing forms in code |
| [`packages/form-schema/`](./packages/form-schema) | The canonical JSON Schema for a form |
| [`docs/`](./docs) · [`infra/`](./infra) | Schema/API docs · Docker & deployment |

## Development

```bash
cd backend  && pip install -e '.[dev]' && pytest        # API + engine tests
cd frontend && npm install && npm test && npm run build # UI tests + build
cd sdk/python && pip install -e . && pytest
```

CI runs the backend and frontend suites on every push. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Status & roadmap

**Beta.** All milestones M0–M8 are implemented and tested (see [`ROADMAP.md`](./ROADMAP.md)).
Before trusting production traffic, review the deployment notes for TLS, a strong
`SUPFORM_SECRET_KEY`, real database credentials, and an SMTP/email backend.

## License

[MIT](./LICENSE) — use it, host it, build on it.
