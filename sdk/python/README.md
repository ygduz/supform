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

## Why a code-first SDK?

- Version forms in git alongside your analysis code.
- Generate forms programmatically (loops, templates, data-driven options).
- CI: validate form definitions before deploying.

The SDK is intentionally dependency-light (just `httpx`) and mirrors
`packages/form-schema`.
