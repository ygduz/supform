"""HTTP client for talking to a running Supform server."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import httpx


class Client:
    """Thin wrapper over the Supform REST API.

    >>> client = Client("http://localhost:8000", token="...")
    >>> client.create_form(project_id="...", content=form.to_dict())
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

    # ---- forms ----
    def create_form(self, *, project_id: str, content: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/v1/forms", {"project_id": project_id, "content": content})

    def publish_form(self, form_id: str) -> dict[str, Any]:
        return self._post(f"/api/v1/forms/{form_id}/publish", {})

    def get_schema(self, form_id: str) -> dict[str, Any]:
        return self._get(f"/api/v1/forms/{form_id}/schema")

    # ---- submissions ----
    def submit(self, form_id: str, answers: dict[str, Any]) -> dict[str, Any]:
        return self._post(f"/api/v1/forms/{form_id}/submissions", {"answers": answers})

    # ---- internals ----
    def _post(self, path: str, json: dict[str, Any]) -> dict[str, Any]:
        resp = self._http.post(path, json=json)
        resp.raise_for_status()
        return resp.json()

    def _get(self, path: str) -> dict[str, Any]:
        resp = self._http.get(path)
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        self._http.close()
