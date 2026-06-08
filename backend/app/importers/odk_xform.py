"""ODK XForm (XML)  ->  Supform schema importer.

XForm is the compiled XML form ODK Collect / Enketo actually render (XLSForm compiles to
it). Supporting direct XForm import means Supform can ingest forms exported from any ODK
tool, not just spreadsheets.

Scaffold/contract only — implemented in milestone M3.
"""

from __future__ import annotations

from app.schemas.form_schema import FormSchema


def import_xform(xml: str) -> FormSchema:  # pragma: no cover - stub
    """Parse ODK XForm XML into a :class:`FormSchema`.

    Plan (M3): parse the ``<h:head>/<model>`` bindings + ``<h:body>`` controls, resolve
    instance/itext for labels and choices, and translate XPath relevance/constraints into
    Supform expressions.
    """
    raise NotImplementedError("ODK XForm import is scaffolded for milestone M3.")
