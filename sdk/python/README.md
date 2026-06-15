# Supform Python SDK

Define forms **in code**, then publish and collect — the "works with coding" half of
Supform. The SDK builds the exact same JSON form schema the visual builder produces, so
code-first and UI-first forms are interchangeable.

## Install

```bash
pip install -e .          # from this directory (sdk/python)
```

## Define a form in code

```python
from supform_sdk import Form, fields

form = Form("household_survey", title="Household survey")
form.add(fields.SingleChoice("region", label="Region", options=["North", "South"], required=True))
form.add(fields.Integer("age", label="Your age", min=0, max=120, required=True))
form.add(fields.SingleChoice(
    "is_head", label="Head of household?", options=["Yes", "No"],
    visible_if="age >= 18",
))

# Inspect the schema (the canonical Supform form JSON)
print(form.to_dict())

# Or push it to a running Supform server
from supform_sdk import Client
client = Client("http://localhost:8000", token="...")
form_id = form.publish(client, project_id="...")
```

## Drive the whole lifecycle from code

The client mirrors the REST API — create, publish, collect, **and pull data back**:

```python
from supform_sdk import Client

with Client("http://localhost:8000") as client:
    client.login("me@example.com", "password")

    # Manage forms
    forms = client.list_forms()
    form = client.get_form(forms[0]["id"])
    client.duplicate_form(form["id"])

    # Pull every submission (auto-pages) into your analysis
    for sub in client.iter_submissions(form["id"]):
        print(sub["answers"])

    # Filter by review status
    approved = client.list_submissions(form["id"], validation_status="approved")

    # Straight to a DataFrame (needs pandas)
    df = client.export_dataframe(form["id"])

    # Or grab a raw export file (csv/xlsx/json/geojson/spss)
    open("out.xlsx", "wb").write(client.export(form["id"], format="xlsx"))

    # Cross-form inbox + review workflow
    client.list_inbox(unread_only=True)
    client.set_validation_status(form["id"], sub["id"], "approved")

    # Webhooks
    client.create_webhook(form["id"], url="https://hooks.example.com/supform")
```

## Why a code-first SDK?

- Version forms in git alongside your analysis code.
- Generate forms programmatically (loops, templates, data-driven options).
- Pull submissions straight into pandas/notebooks — no manual CSV downloads.
- CI: validate form definitions before deploying.

The SDK is intentionally dependency-light (just `httpx`; `pandas` only for
`export_dataframe`) and mirrors `packages/form-schema`.
