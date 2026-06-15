"""Client tests using an httpx MockTransport — no running server needed.

These assert the SDK builds the right method, path, query params, and body for
each endpoint, and unwraps responses correctly (incl. paging and exports).
"""

from __future__ import annotations

import httpx
import pytest

from supform_sdk import Client


def make_client(handler) -> Client:
    """A Client whose underlying httpx.Client routes through a mock transport."""
    client = Client("http://test", token="tok")
    client._http = httpx.Client(
        base_url="http://test",
        headers={"Authorization": "Bearer tok"},
        transport=httpx.MockTransport(handler),
    )
    return client


def test_login_sets_auth_header():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["path"] = req.url.path
        return httpx.Response(200, json={"access_token": "abc", "refresh_token": "r"})

    client = make_client(handler)
    token = client.login("a@b.c", "pw")
    assert token == "abc"
    assert seen["path"] == "/api/v1/auth/login"
    assert client._http.headers["Authorization"] == "Bearer abc"


def test_list_and_get_form():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v1/forms" and req.method == "GET":
            return httpx.Response(200, json=[{"id": "f1"}, {"id": "f2"}])
        if req.url.path == "/api/v1/forms/f1":
            return httpx.Response(200, json={"id": "f1", "title": "T"})
        return httpx.Response(404)

    client = make_client(handler)
    assert [f["id"] for f in client.list_forms()] == ["f1", "f2"]
    assert client.get_form("f1")["title"] == "T"


def test_list_submissions_passes_filters():
    captured = {}

    def handler(req: httpx.Request) -> httpx.Response:
        captured["params"] = dict(req.url.params)
        return httpx.Response(200, json=[{"id": "s1"}])

    client = make_client(handler)
    client.list_submissions("f1", limit=25, offset=50, validation_status="approved")
    assert captured["params"] == {
        "limit": "25",
        "offset": "50",
        "validation_status": "approved",
    }


def test_iter_submissions_pages_until_short_page():
    # Two full pages of 2, then a short page of 1 → 5 total, then stop.
    pages = [
        [{"id": "1"}, {"id": "2"}],
        [{"id": "3"}, {"id": "4"}],
        [{"id": "5"}],
    ]
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        body = pages[calls["n"]] if calls["n"] < len(pages) else []
        calls["n"] += 1
        return httpx.Response(200, json=body)

    client = make_client(handler)
    ids = [s["id"] for s in client.iter_submissions("f1", page_size=2)]
    assert ids == ["1", "2", "3", "4", "5"]
    # Stopped on the short page — no extra request for an empty page.
    assert calls["n"] == 3


def test_export_returns_raw_bytes():
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.params["format"] == "xlsx"
        return httpx.Response(200, content=b"\x50\x4b\x03\x04")  # xlsx magic

    client = make_client(handler)
    assert client.export("f1", format="xlsx") == b"\x50\x4b\x03\x04"


def test_create_webhook_body():
    captured = {}

    def handler(req: httpx.Request) -> httpx.Response:
        import json

        captured["path"] = req.url.path
        captured["body"] = json.loads(req.content)
        return httpx.Response(201, json={"id": "wh1"})

    client = make_client(handler)
    client.create_webhook("f1", url="https://hook.test/x")
    assert captured["path"] == "/api/v1/forms/f1/webhooks"
    assert captured["body"] == {"url": "https://hook.test/x", "event": "submission.created"}


def test_delete_form_no_content():
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.method == "DELETE"
        return httpx.Response(204)

    client = make_client(handler)
    assert client.delete_form("f1") is None


def test_context_manager_closes():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    with make_client(handler) as client:
        assert client.list_forms() == []


def test_raises_on_http_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"detail": "nope"})

    client = make_client(handler)
    with pytest.raises(httpx.HTTPStatusError):
        client.get_form("missing")
