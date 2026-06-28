"""DB-backed API tests — exercise the full loop against an in-memory SQLite database.

The ``client`` fixture (shared in-memory SQLite ASGI client) lives in ``conftest.py``.
"""

from __future__ import annotations

import httpx
import pytest


def _form_payload(project_id: str) -> dict:
    return {
        "project_id": project_id,
        "content": {
            "name": "household_survey",
            "title": "Household survey",
            "pages": [
                {
                    "name": "p1",
                    "elements": [
                        {
                            "type": "single_choice",
                            "name": "region",
                            "label": "Region",
                            "required": True,
                            "options": [{"value": "north"}, {"value": "south"}],
                        },
                        {
                            "type": "integer",
                            "name": "age",
                            "label": "Age",
                            "required": True,
                            "validation": {"min": 0, "max": 120},
                        },
                        {
                            "type": "single_choice",
                            "name": "is_head",
                            "label": "Head?",
                            "options": [{"value": "yes"}, {"value": "no"}],
                            "visibleIf": "age >= 18",
                        },
                    ],
                }
            ],
        },
    }


async def _headers_for(client: httpx.AsyncClient, email: str = "a@b.c") -> dict:
    await client.post("/api/v1/auth/signup", json={"email": email, "password": "supersecret"})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _auth_headers(client: httpx.AsyncClient) -> dict:
    return await _headers_for(client)


async def _published_form(client: httpx.AsyncClient, headers: dict) -> str:
    """Create a project + form and publish it; return the form id."""
    proj = await client.post("/api/v1/projects", json={"name": "R"}, headers=headers)
    form = await client.post(
        "/api/v1/forms", json=_form_payload(proj.json()["id"]), headers=headers
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


@pytest.mark.asyncio
async def test_full_loop(client: httpx.AsyncClient):
    headers = await _auth_headers(client)

    proj = await client.post("/api/v1/projects", json={"name": "Research"}, headers=headers)
    assert proj.status_code == 201
    project_id = proj.json()["id"]

    created = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=headers)
    assert created.status_code == 201
    form_id = created.json()["id"]

    pub = await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    assert pub.status_code == 200
    assert pub.json()["version"] == 1
    assert pub.json()["respondent_url"] == f"/f/{form_id}"

    schema = await client.get(f"/api/v1/forms/{form_id}/schema")
    assert schema.status_code == 200 and schema.json()["version"] == 1

    # Valid submission: age < 18 hides is_head -> dropped from stored answers.
    ok = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"region": "north", "age": 15}}
    )
    assert ok.status_code == 201
    assert "is_head" not in ok.json()["answers"]

    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=headers)
    assert listed.status_code == 200 and len(listed.json()) == 1


@pytest.mark.asyncio
async def test_publish_empty_form_rejected(client: httpx.AsyncClient):
    """A draft with no questions saves fine but must not publish to a blank page."""
    headers = await _auth_headers(client)
    proj = await client.post("/api/v1/projects", json={"name": "Empty"}, headers=headers)
    empty = {
        "project_id": proj.json()["id"],
        "content": {"name": "blank", "title": "Blank", "pages": [{"name": "p1", "elements": []}]},
    }
    created = await client.post("/api/v1/forms", json=empty, headers=headers)
    assert created.status_code == 201  # empty draft is allowed
    form_id = created.json()["id"]

    pub = await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    assert pub.status_code == 422
    assert "at least one question" in pub.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_invalid_submission_rejected(client: httpx.AsyncClient):
    headers = await _auth_headers(client)
    form_id = await _published_form(client, headers)

    bad = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"age": 999}})
    assert bad.status_code == 422
    details = bad.json()["error"]["details"]
    assert "age" in details and "region" in details


@pytest.mark.asyncio
async def test_auth_required_for_listing(client: httpx.AsyncClient):
    r = await client.get("/api/v1/forms/00000000-0000-0000-0000-000000000000/submissions")
    assert r.status_code == 401


async def _publish_form_with_settings(
    client: httpx.AsyncClient, headers: dict, settings: dict
) -> str:
    """Create + publish a single-field form carrying the given collection settings."""
    proj = await client.post("/api/v1/projects", json={"name": "S"}, headers=headers)
    content = {
        "name": "poll",
        "title": "Poll",
        "settings": settings,
        "pages": [{"name": "p1", "elements": [{"type": "text", "name": "q1", "label": "Q"}]}],
    }
    form = await client.post(
        "/api/v1/forms",
        json={"project_id": proj.json()["id"], "content": content},
        headers=headers,
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=headers)
    return form_id


@pytest.mark.asyncio
async def test_require_login_blocks_anonymous_submission(client: httpx.AsyncClient):
    owner = await _headers_for(client, "poll-owner@b.c")
    form_id = await _publish_form_with_settings(client, owner, {"requireLogin": True})

    anon = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}})
    assert anon.status_code == 401

    signed_in = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}}, headers=owner
    )
    assert signed_in.status_code == 201


@pytest.mark.asyncio
async def test_closed_form_rejects_submission(client: httpx.AsyncClient):
    owner = await _headers_for(client, "closed-owner@b.c")
    form_id = await _publish_form_with_settings(
        client, owner, {"closeDate": "2000-01-01T00:00:00Z"}
    )
    r = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_response_limit_enforced(client: httpx.AsyncClient):
    owner = await _headers_for(client, "limit-owner@b.c")
    form_id = await _publish_form_with_settings(client, owner, {"maxResponses": 1})

    first = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "a"}})
    assert first.status_code == 201
    second = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "b"}}
    )
    assert second.status_code == 403


@pytest.mark.asyncio
async def test_accepting_responses_master_switch(client: httpx.AsyncClient):
    owner = await _headers_for(client, "accept-owner@b.c")
    form_id = await _publish_form_with_settings(client, owner, {"acceptingResponses": False})
    r = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_open_date_blocks_early_submission(client: httpx.AsyncClient):
    owner = await _headers_for(client, "open-owner@b.c")
    form_id = await _publish_form_with_settings(client, owner, {"openDate": "2999-01-01T00:00:00Z"})
    r = await client.post(f"/api/v1/forms/{form_id}/submissions", json={"answers": {"q1": "x"}})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_quiz_grading_end_to_end(client: httpx.AsyncClient):
    """A graded quiz submission is scored server-side and surfaced on the submission."""
    owner = await _headers_for(client, "quiz-owner@b.c")
    proj = await client.post("/api/v1/projects", json={"name": "Q"}, headers=owner)
    content = {
        "name": "exam",
        "title": "Exam",
        "settings": {
            "quizMode": True,
            "outcomes": [{"min": 2, "max": 99, "message": "Pass"}],
        },
        "pages": [
            {
                "name": "p1",
                "elements": [
                    {
                        "type": "single_choice",
                        "name": "capital",
                        "label": "Capital of France?",
                        "points": 2,
                        "options": [{"value": "paris", "correct": True}, {"value": "lyon"}],
                    },
                    {
                        "type": "text",
                        "name": "river",
                        "label": "Longest river?",
                        "correctAnswer": "Nile",
                    },
                ],
            }
        ],
    }
    form = await client.post(
        "/api/v1/forms",
        json={"project_id": proj.json()["id"], "content": content},
        headers=owner,
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=owner)

    # One right (capital, 2 pts), one wrong (river) → 2/3 points, 1/2 correct.
    sub = await client.post(
        f"/api/v1/forms/{form_id}/submissions",
        json={"answers": {"capital": "paris", "river": "Amazon"}},
    )
    assert sub.status_code == 201
    body = sub.json()
    # These options carry `correct` flags (not additive `score`), so _score is 0; the graded
    # result is surfaced via the grading fields and drives outcome matching.
    assert body["score"] == 0
    assert body["max_score"] == 3
    assert body["correct_count"] == 1
    assert body["graded_count"] == 2
    assert body["grading"]["earnedPoints"] == 2
    assert body["outcome"]["message"] == "Pass"


@pytest.mark.asyncio
async def test_show_correct_answers_false_hides_grading_in_submit_response(
    client: httpx.AsyncClient,
):
    """With showCorrectAnswers off, the public submit response must not leak the answer key."""
    owner = await _headers_for(client, "secret-quiz@b.c")
    proj = await client.post("/api/v1/projects", json={"name": "Q"}, headers=owner)
    content = {
        "name": "secret",
        "title": "Secret quiz",
        "settings": {"quizMode": True, "showCorrectAnswers": False},
        "pages": [
            {
                "name": "p1",
                "elements": [
                    {
                        "type": "single_choice",
                        "name": "capital",
                        "label": "Capital?",
                        "options": [{"value": "paris", "correct": True}, {"value": "lyon"}],
                    }
                ],
            }
        ],
    }
    form = await client.post(
        "/api/v1/forms",
        json={"project_id": proj.json()["id"], "content": content},
        headers=owner,
    )
    form_id = form.json()["id"]
    await client.post(f"/api/v1/forms/{form_id}/publish", headers=owner)

    sub = await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"capital": "lyon"}}
    )
    assert sub.status_code == 201
    # Answer key must NOT be present in the public response…
    assert sub.json()["grading"] is None
    assert sub.json()["outcome"] is None
    # …but the owner's authenticated listing still sees the full grading.
    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    assert listed.json()[0]["grading"]["perField"]["capital"]["correctAnswer"] == ["paris"]


@pytest.mark.asyncio
async def test_file_upload_and_owner_only_download(
    client: httpx.AsyncClient, tmp_path, monkeypatch
):
    from app.core import config

    monkeypatch.setattr(config.settings, "storage_local_path", str(tmp_path))

    owner = await _headers_for(client, "media-owner@b.c")
    form_id = await _published_form(client, owner)

    # Anyone can upload to a published form (respondents are often anonymous).
    up = await client.post(
        f"/api/v1/forms/{form_id}/uploads",
        files={"file": ("note.txt", b"hello bytes", "text/plain")},
    )
    assert up.status_code == 201
    media = up.json()
    assert media["filename"] == "note.txt" and media["size"] == 11
    media_url = media["url"]

    # Owner downloads the bytes back.
    got = await client.get(media_url, headers=owner)
    assert got.status_code == 200 and got.content == b"hello bytes"

    # A different user cannot (existence hidden as 404).
    attacker = await _headers_for(client, "media-attacker@b.c")
    assert (await client.get(media_url, headers=attacker)).status_code == 404
    # Anonymous download is rejected.
    assert (await client.get(media_url)).status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_exchanges_for_new_access(client: httpx.AsyncClient):
    await client.post("/api/v1/auth/signup", json={"email": "r@b.c", "password": "supersecret"})
    login = await client.post(
        "/api/v1/auth/login", json={"email": "r@b.c", "password": "supersecret"}
    )
    refresh_token = login.json()["refresh_token"]

    ok = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    # An access token may not be used where a refresh token is expected.
    bad = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login.json()["access_token"]}
    )
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_other_user_cannot_touch_your_form(client: httpx.AsyncClient):
    """A logged-in user must not read, modify, publish, list, or export someone else's form."""
    owner = await _headers_for(client, "owner@b.c")
    form_id = await _published_form(client, owner)

    # A respondent submits so there is data to (try to) exfiltrate.
    await client.post(
        f"/api/v1/forms/{form_id}/submissions", json={"answers": {"region": "north", "age": 15}}
    )

    attacker = await _headers_for(client, "attacker@b.c")

    # Each owner-only action returns 404 (existence is never disclosed) for the attacker.
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=attacker)).status_code == 404
    assert (
        await client.get(f"/api/v1/forms/{form_id}/submissions", headers=attacker)
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/forms/{form_id}/export?format=csv", headers=attacker)
    ).status_code == 404
    assert (
        await client.post(f"/api/v1/forms/{form_id}/publish", headers=attacker)
    ).status_code == 404
    upd = await client.put(
        f"/api/v1/forms/{form_id}",
        json={"content": _form_payload("x")["content"]},
        headers=attacker,
    )
    assert upd.status_code == 404

    # The owner still has full access.
    assert (await client.get(f"/api/v1/forms/{form_id}", headers=owner)).status_code == 200
    listed = await client.get(f"/api/v1/forms/{form_id}/submissions", headers=owner)
    assert listed.status_code == 200 and len(listed.json()) == 1


@pytest.mark.asyncio
async def test_cannot_create_form_in_another_users_project(client: httpx.AsyncClient):
    owner = await _headers_for(client, "owner2@b.c")
    proj = await client.post("/api/v1/projects", json={"name": "P"}, headers=owner)
    project_id = proj.json()["id"]

    attacker = await _headers_for(client, "attacker2@b.c")
    r = await client.post("/api/v1/forms", json=_form_payload(project_id), headers=attacker)
    assert r.status_code == 404
