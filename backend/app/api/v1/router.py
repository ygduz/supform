"""Aggregate all v1 routers under a single APIRouter."""

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    exports,
    forms,
    imports,
    media,
    members,
    projects,
    submissions,
    webhooks,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(members.router)
api_router.include_router(forms.router)
api_router.include_router(submissions.router)
api_router.include_router(exports.router)
api_router.include_router(imports.router)
api_router.include_router(media.router)
api_router.include_router(webhooks.router)
