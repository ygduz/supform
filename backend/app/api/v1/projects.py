"""Project (workspace) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.user import User
from app.schemas.api import ProjectCreate, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = Project(name=payload.name, description=payload.description, owner_id=user.id)
    db.add(project)
    await db.flush()
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Project]:
    stmt = (
        select(Project)
        .outerjoin(ProjectMembership, ProjectMembership.project_id == Project.id)
        .where(or_(Project.owner_id == user.id, ProjectMembership.user_id == user.id))
        .distinct()
        .order_by(Project.created_at)
    )
    return list(await db.scalars(stmt))
