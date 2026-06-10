# Roadmap

A pragmatic build order. Each milestone is shippable on its own.

## M0 — Scaffold (this commit)
- [x] Monorepo structure, docs, architecture
- [x] Form Schema spec (`packages/form-schema`)
- [x] Backend skeleton (FastAPI app factory, config, models, routers — stubbed)
- [x] Frontend skeleton (Vite + React + TS, feature folders)
- [x] Python SDK skeleton
- [x] Docker compose for local dev

## M1 — Core form engine (backend)
- [x] Pydantic models for the full Form Schema + validation
- [x] Submission validation against a schema version
- [x] Expression/logic evaluator (`visibleIf`, `calculate`, validation rules)
- [x] CRUD API for projects, forms, versions, submissions
- [x] Auth (JWT, stdlib HS256)
- [x] Alembic migration + Postgres JSONB storage (portable to SQLite for tests)
- [x] End-to-end vertical slice verified (`scripts/smoke_e2e.py`)
- [x] Per-object permissions — ownership checks (forms/submissions/export/import)
- [x] Sharing / roles beyond the owner (project memberships: viewer/editor/owner,
      role-gated API + Share dialog in the builder)
- [x] Media/file upload handling (local storage; S3 backend pending, M4)

## M2 — Builder & renderer (frontend)
- [x] Renderer: schema → interactive validated form (client-side validation + 422 mapping;
      groups render recursively, repeat preview still TODO)
- [x] Builder: drag-and-drop, live preview, multi-page, groups/repeats/matrix authoring,
      and a logic + validation editor (visibleIf/requiredIf/calculate, min/max/length/
      pattern/selected). Cross-container drag still TODO
- [x] Theming system (primary/background color, font, corner radius, logo/cover; live preview)
- [x] Results table + per-field summary + CSV/XLSX/JSON export buttons

## M3 — Interoperability
- [x] XLSForm importer → Supform schema
- [x] ODK XForm importer (XML: binds, itext, select/group/repeat/upload, XPath logic)
- [x] CSV / XLSX / JSON exporters (synchronous endpoint + async Celery job flow)

## M4 — Collection at scale
- [x] Public form links, access control, response limits (requireLogin, closeDate,
      maxResponses, single-response; share link + closed/sign-in gates in the renderer)
- [x] Offline / PWA collection (installable PWA shell via service worker; schemas
      cached per device; offline submissions queue locally and auto-sync on reconnect)
- [x] Webhooks & integrations (per-form outbound webhooks, HMAC-SHA256 signed,
      delivered off-request via Celery with retries; managed from the builder)
- [x] File/media attachments via S3 (pluggable S3Storage backend, S3-compatible/MinIO
      support via endpoint_url; selected with SUPFORM_STORAGE_BACKEND=s3)

## M5 — Polish
- [x] i18n / multi-language forms (per-language labels/hints in the builder, language
      config in settings, and a live language switcher in the renderer)
- [x] Templates gallery (ready-made forms — contact, RSVP, feedback/NPS, job
      application — openable in the builder from /templates)
- [x] Collaboration & sharing (delivered with the M1 roles work: project memberships,
      viewer/editor/owner, Share dialog in the builder)
- [x] Analytics dashboards (responses view toggles between an analytics panel —
      responses-over-time, choice-distribution bars, numeric stats — and the table)

## M6 — Delight (easier & more beautiful than MS Forms)
- [x] Forms dashboard — GET /forms with role-aware scope + response counts, owner-only
      delete; /forms card grid with search, actions, and an empty state. Home/login now
      land here.
- [x] Paged renderer: Back/Next page navigation with per-page validation, progress bar,
      one-question-per-screen mode, page visibleIf, display-mode setting in the builder
- [x] Builder autosave (debounced 2s) + undo/redo (bounded history, Ctrl+Z/Ctrl+Shift+Z,
      toolbar buttons, "Saving… / Saved ✓" indicator)
- [x] Theme presets (8 one-click palettes) + welcome screen + thank-you redirect +
      design pass (button transitions, focus rings); settings.welcomeTitle/welcomeMessage/
      redirectUrl across all 4 schema contract files + SDK Form.settings()
- [x] Templates expansion: 9 built-ins (NPS, event registration, order, volunteer,
      course evaluation, …), form JSON export/import in the builder, and local
      "My templates" (save current form, shown in its own gallery section)

## M7 — Data credibility (better than Kobo)
- [x] Repeat-aware exports: XLSX emits one long-format sheet per repeat (one row per
      instance, linked by _parent_id); main sheet treats a repeat as a single column
      (fixes repeat children leaking in as empty columns)
- [x] Record validation / approval workflow: per-submission status (approved / on_hold /
      not_approved) with validated_by/at, editor-gated PATCH + filter + single-row delete;
      responses table gains status dropdowns, filter chips, and delete
- [x] Geo questions (geopoint widget: "use my location" + manual lat/lng, shape-validated
      server-side), a Leaflet map view of responses, and cascading selects (options filtered
      by Choice.visibleIf against the live answers)

## M8 — Differentiators
- [x] AI form generation (prompt → validated draft schema via an Anthropic-compatible
      Messages API over httpx; self-correcting retry; rate-limited; pluggable & off until
      SUPFORM_AI_API_KEY is set; "Generate with AI" dialog on /templates)
- [ ] Embed + prefill kit (iframe embed script, URL prefill, hidden fields, QR share)
- [ ] Quiz scoring & outcomes
- [ ] Email response notifications
