"""Domain exceptions and a FastAPI exception-handler installer.

Keeping a small exception taxonomy lets services raise meaningful errors that the API
layer maps to clean HTTP responses, instead of leaking framework details.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class SupformError(Exception):
    """Base class for all expected application errors."""

    status_code = 400
    code = "error"

    def __init__(self, message: str, *, details: object | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(SupformError):
    status_code = 404
    code = "not_found"


class PermissionDeniedError(SupformError):
    status_code = 403
    code = "permission_denied"


class ValidationError(SupformError):
    """Raised when a form definition or submission fails validation."""

    status_code = 422
    code = "validation_error"


class AuthError(SupformError):
    status_code = 401
    code = "auth_error"


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(SupformError)
    async def _handle(_: Request, exc: SupformError) -> JSONResponse:  # type: ignore[unused-ignore]
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )
