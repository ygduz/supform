"""Shared pytest fixtures.

The form-engine tests are pure and need no database. DB-backed API tests (added in M1)
will use an in-memory SQLite (aiosqlite) engine configured here.
"""

import pytest


@pytest.fixture
def contact_form_dict() -> dict:
    return {
        "name": "contact",
        "title": "Contact",
        "pages": [
            {
                "name": "p1",
                "elements": [
                    {"type": "text", "name": "full_name", "required": True},
                ],
            }
        ],
    }
