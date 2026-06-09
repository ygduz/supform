"""Exporters turn submissions into downloadable data files.

Each exporter takes a form version's schema (for column ordering/labels) plus an iterable
of submissions, and writes bytes/text in the target format. Tabular exporters (CSV/XLSX)
share column and cell rules via :mod:`app.exporters.flatten`.
"""

from app.exporters.csv_exporter import export_csv
from app.exporters.flatten import compute_columns, flatten_rows
from app.exporters.json_exporter import export_json
from app.exporters.xlsx_exporter import export_xlsx

__all__ = [
    "compute_columns",
    "export_csv",
    "export_json",
    "export_xlsx",
    "flatten_rows",
]
