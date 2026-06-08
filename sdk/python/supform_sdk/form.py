"""The ``Form`` builder — assemble a Supform schema fluently in code."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from supform_sdk.client import Client

Element = dict[str, Any]


class Form:
    """A code-first form. Add fields, then ``to_dict()`` / ``publish()``.

    Produces the same JSON schema as the visual builder (see packages/form-schema), so a
    form built here is a first-class Supform form.
    """

    def __init__(
        self,
        name: str,
        *,
        title: str | None = None,
        description: str | None = None,
        page: str = "page1",
    ) -> None:
        self.name = name
        self.title = title or name
        self.description = description
        self._pages: list[dict[str, Any]] = [{"name": page, "elements": []}]

    # ---- building ----
    def add(self, *elements: Element, page: int = 0) -> "Form":
        """Add one or more field dicts (see :mod:`supform_sdk.fields`) to a page."""
        self._pages[page]["elements"].extend(elements)
        return self

    def add_page(self, name: str, *, title: str | None = None) -> "Form":
        page: dict[str, Any] = {"name": name, "elements": []}
        if title:
            page["title"] = title
        self._pages.append(page)
        return self

    # ---- serialization ----
    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": "1.0",
            "name": self.name,
            "title": self.title,
            **({"description": self.description} if self.description else {}),
            "pages": self._pages,
        }

    def to_json(self, *, indent: int | None = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    # ---- server ----
    def publish(self, client: "Client", *, project_id: str) -> str:
        """Create the form on the server and publish version 1. Returns the form id."""
        created = client.create_form(project_id=project_id, content=self.to_dict())
        form_id = created["id"]
        client.publish_form(form_id)
        return form_id

    def __repr__(self) -> str:
        n = sum(len(p["elements"]) for p in self._pages)
        return f"<Form name={self.name!r} fields={n}>"
