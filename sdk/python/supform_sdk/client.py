"""HTTP client for talking to a running Supform server."""

from __future__ import annotations

from typing import Any


class Client:
    """Thin wrapper over the Supform REST API.

    >>> client = Client("http://localhost:8000", token="...")
    >>> form = client.create_form(project_id="...", content=form.to_dict())
    >>> client.publish_form(form["id"])
    >>> for sub in client.iter_submissions(form["id"]):
    ...     print(sub["answers"])
    """

    def __init__(self, base_url: str, *, token: str | None = None, timeout: float = 30.0) -> None:
        import httpx  # imported lazily so the form-building SDK works without httpx

        self.base_url = base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._http = httpx.Client(base_url=self.base_url, headers=headers, timeout=timeout)

    # ---- auth ----
    def signup(self, email: str, password: str, full_name: str | None = None) -> dict[str, Any]:
        return self._post(
            "/api/v1/auth/signup",
            {"email": email, "password": password, "full_name": full_name},
        )

    def login(self, email: str, password: str) -> str:
        data = self._post("/api/v1/auth/login", {"email": email, "password": password})
        token = data["access_token"]
        self._http.headers["Authorization"] = f"Bearer {token}"
        return token

    # ---- projects ----
    def create_project(self, name: str, description: str | None = None) -> dict[str, Any]:
        return self._post("/api/v1/projects", {"name": name, "description": description})

    def list_projects(self) -> list[dict[str, Any]]:
        return self._get("/api/v1/projects")

    # ---- forms ----
    def create_form(self, *, project_id: str, content: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/v1/forms", {"project_id": project_id, "content": content})

    def list_forms(self) -> list[dict[str, Any]]:
        return self._get("/api/v1/forms")

    def get_form(self, form_id: str) -> dict[str, Any]:
        return self._get(f"/api/v1/forms/{form_id}")

    def update_form(self, form_id: str, *, content: dict[str, Any]) -> dict[str, Any]:
        return self._put(f"/api/v1/forms/{form_id}", {"content": content})

    def duplicate_form(self, form_id: str) -> dict[str, Any]:
        return self._post(f"/api/v1/forms/{form_id}/duplicate", {})

    def delete_form(self, form_id: str) -> None:
        self._delete(f"/api/v1/forms/{form_id}")

    def publish_form(self, form_id: str) -> dict[str, Any]:
        return self._post(f"/api/v1/forms/{form_id}/publish", {})

    def get_schema(self, form_id: str) -> dict[str, Any]:
        return self._get(f"/api/v1/forms/{form_id}/schema")

    # ---- submissions ----
    def submit(self, form_id: str, answers: dict[str, Any]) -> dict[str, Any]:
        return self._post(f"/api/v1/forms/{form_id}/submissions", {"answers": answers})

    def list_submissions(
        self,
        form_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
        validation_status: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return a single page of submissions (newest first)."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if validation_status is not None:
            params["validation_status"] = validation_status
        return self._get(f"/api/v1/forms/{form_id}/submissions", params=params)

    def iter_submissions(
        self,
        form_id: str,
        *,
        page_size: int = 100,
        validation_status: str | None = None,
    ):
        """Yield every submission for a form, paging transparently."""
        offset = 0
        while True:
            page = self.list_submissions(
                form_id,
                limit=page_size,
                offset=offset,
                validation_status=validation_status,
            )
            if not page:
                return
            yield from page
            if len(page) < page_size:
                return
            offset += page_size

    def delete_submission(self, form_id: str, submission_id: str) -> None:
        self._delete(f"/api/v1/forms/{form_id}/submissions/{submission_id}")

    def set_validation_status(
        self, form_id: str, submission_id: str, status: str | None
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/v1/forms/{form_id}/submissions/{submission_id}/validation",
            {"status": status},
        )

    def set_workflow_step(self, submission_id: str, step: str) -> dict[str, Any]:
        return self._patch(f"/api/v1/submissions/{submission_id}/workflow-step?step={step}", {})

    # ---- inbox ----
    def list_inbox(self, *, unread_only: bool = False, limit: int = 50) -> list[dict[str, Any]]:
        return self._get(
            "/api/v1/inbox", params={"unread_only": unread_only, "limit": limit}
        )

    # ---- exports ----
    def export(self, form_id: str, *, format: str = "csv") -> bytes:
        """Download submissions as a file (csv/xlsx/json/geojson/spss/...). Returns raw bytes."""
        resp = self._http.get(f"/api/v1/forms/{form_id}/export", params={"format": format})
        resp.raise_for_status()
        return resp.content

    def export_dataframe(self, form_id: str):
        """Convenience: return submissions as a pandas DataFrame (requires pandas)."""
        import io

        import pandas as pd  # lazily imported; optional dependency

        return pd.read_csv(io.BytesIO(self.export(form_id, format="csv")))

    # ---- webhooks ----
    def list_webhooks(self, form_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/v1/forms/{form_id}/webhooks")

    def create_webhook(
        self, form_id: str, *, url: str, event: str = "submission.created"
    ) -> dict[str, Any]:
        return self._post(f"/api/v1/forms/{form_id}/webhooks", {"url": url, "event": event})

    def delete_webhook(self, form_id: str, webhook_id: str) -> None:
        self._delete(f"/api/v1/forms/{form_id}/webhooks/{webhook_id}")

    # ---- internals ----
    def _post(self, path: str, json: dict[str, Any]) -> Any:
        resp = self._http.post(path, json=json)
        resp.raise_for_status()
        return resp.json() if resp.content else None

    def _put(self, path: str, json: dict[str, Any]) -> Any:
        resp = self._http.put(path, json=json)
        resp.raise_for_status()
        return resp.json() if resp.content else None

    def _patch(self, path: str, json: dict[str, Any]) -> Any:
        resp = self._http.patch(path, json=json)
        resp.raise_for_status()
        return resp.json() if resp.content else None

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._http.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    def _delete(self, path: str) -> None:
        resp = self._http.delete(path)
        resp.raise_for_status()

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> Client:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
