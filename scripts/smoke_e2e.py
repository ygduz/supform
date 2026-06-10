"""End-to-end smoke test: drive the whole product loop through the Python SDK.

Requires a running Supform API (see backend/README.md) at $SUPFORM_API_URL
(default http://127.0.0.1:8000). Exercises:

    signup -> login -> create project -> create form (code-first) -> publish
           -> submit a VALID response -> submit an INVALID response (expect 422)
           -> list responses

Run:  python scripts/smoke_e2e.py
"""

from __future__ import annotations

import os
import sys
import uuid

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "python"))

from supform_sdk import Client, Form, fields  # noqa: E402

API = os.environ.get("SUPFORM_API_URL", "http://127.0.0.1:8000")


def main() -> int:
    client = Client(API)
    email = f"user_{uuid.uuid4().hex[:8]}@example.com"

    print(f"→ signup {email}")
    client.signup(email, "supersecret", full_name="Test User")

    print("→ login")
    client.login(email, "supersecret")

    print("→ create project")
    project = client.create_project("Field research", "smoke test project")

    print("→ build form in code")
    form = Form("household_survey", title="Household survey")
    form.add(
        fields.SingleChoice("region", label="Region", options=["North", "South"], required=True),
        fields.Integer("age", label="Your age", min=0, max=120, required=True),
        fields.SingleChoice(
            "is_head", label="Head of household?",
            options=["Yes", "No"], visible_if="age >= 18",
        ),
    )

    print("→ create + publish form")
    form_id = form.publish(client, project_id=project["id"])
    print(f"   form_id={form_id}")

    print("→ fetch published schema")
    schema = client.get_schema(form_id)
    assert schema["version"] == 1, schema
    assert {e["name"] for p in schema["pages"] for e in p["elements"]} == {"region", "age", "is_head"}

    print("→ submit VALID response (age<18 → is_head hidden, not required)")
    ok = client.submit(form_id, {"region": "North", "age": 15})
    print(f"   stored submission id={ok['id']} version={ok['form_version']}")
    assert "is_head" not in ok["answers"], "hidden field should be dropped"

    print("→ submit INVALID response (age out of range, missing required region)")
    try:
        client.submit(form_id, {"age": 999})
        print("   ERROR: invalid submission was accepted!")
        return 1
    except httpx.HTTPStatusError as exc:
        body = exc.response.json()
        assert exc.response.status_code == 422, exc.response.status_code
        details = body["error"]["details"]
        print(f"   correctly rejected (422): {details}")
        assert "age" in details and "region" in details

    print("→ list responses")
    resp = httpx.get(
        f"{API}/api/v1/forms/{form_id}/submissions",
        headers={"Authorization": client._http.headers["Authorization"]},
    )
    resp.raise_for_status()
    rows = resp.json()
    print(f"   {len(rows)} stored response(s)")
    assert len(rows) == 1, rows

    print("\n✅ End-to-end loop passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
