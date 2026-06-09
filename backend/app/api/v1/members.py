"""Project sharing: manage collaborator roles on a project.

Listing members needs ``viewer`` access; granting, re-roling, or removing collaborators
is owner-only.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api import MemberAdd, MemberOut, MemberUpdate
from app.services import memberships

router = APIRouter(prefix="/projects/{project_id}/members", tags=["members"])


def _member_out(user: User, role: str) -> MemberOut:
    return MemberOut(user_id=user.id, email=user.email, full_name=user.full_name, role=role)


@router.get("", response_model=list[MemberOut])
async def list_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MemberOut]:
    await memberships.require_project_role(db, project_id, user.id, "viewer")
    return [_member_out(u, role) for u, role in await memberships.list_members(db, project_id)]


@router.post("", response_model=MemberOut, status_code=201)
async def add_member(
    project_id: uuid.UUID,
    payload: MemberAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberOut:
    await memberships.require_project_role(db, project_id, user.id, "owner")
    member, role = await memberships.add_member(db, project_id, payload.email, payload.role)
    await db.commit()
    return _member_out(member, role)


@router.patch("/{member_id}", response_model=MemberOut)
async def update_member(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: MemberUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemberOut:
    await memberships.require_project_role(db, project_id, user.id, "owner")
    member, role = await memberships.update_member(db, project_id, member_id, payload.role)
    await db.commit()
    return _member_out(member, role)


@router.delete("/{member_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await memberships.require_project_role(db, project_id, user.id, "owner")
    await memberships.remove_member(db, project_id, member_id)
    await db.commit()
