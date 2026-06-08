"""SQLAlchemy ORM models.

Importing this package registers every model on the shared ``Base.metadata`` so Alembic
autogeneration and ``create_all`` can see them.
"""

from app.models.form import Form, FormVersion
from app.models.project import Project
from app.models.submission import Submission
from app.models.user import User

__all__ = ["User", "Project", "Form", "FormVersion", "Submission"]
