"""Project membership / role logic — the single authorization gate for team access.

Roles form a hierarchy: ``viewer`` < ``editor`` < ``owner``. The project's
``owner_id`` always resolves to the implicit ``owner`` role; additional collaborators
are stored as :class:`ProjectMembership` rows. Forms inherit their project's roles.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.user import User

# Hierarchy levels; a higher number includes every lower capability.
ROLE_LEVELS = {"viewer": 1, "editor": 2, "owner": 3}
# Roles that can be granted to a collaborator (``owner`` is fixed to the project owner).
GRANTABLE_ROLES = ("viewer", "editor")


def _level(role: str | None) -> int:
    return ROLE_LEVELS.get(role or "", 0)


async def get_project_role(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> str | None:
    """Return the caller's effective role on a project, or ``None`` if they have none."""
    project = await db.get(Project, project_id)
    if project is None:
        return None
    if project.owner_id == user_id:
        return "owner"
    stmt = select(ProjectMembership).where(
        ProjectMembership.project_id == project_id,
        ProjectMembership.user_id == user_id,
    )
    membership = (await db.execute(stmt)).scalar_one_or_none()
    return membership.role if membership else None


async def require_project_role(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, min_role: str
) -> Project:
    """Ensure the caller has at least ``min_role`` on the project, else raise.

    Non-members get a 404 (so the API never reveals projects they can't see); members
    whose role is too low for the action get a 403.
    """
    project = await db.get(Project, project_id)
    role: str | None = None
    if project is not None:
        if project.owner_id == user_id:
            role = "owner"
        else:
            stmt = select(ProjectMembership).where(
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == user_id,
            )
            membership = (await db.execute(stmt)).scalar_one_or_none()
            role = membership.role if membership else None

    if role is None:
        raise NotFoundError("Project not found")
    if _level(role) < _level(min_role):
        raise PermissionDeniedError("You don't have permission to perform this action")
    return project


async def list_members(db: AsyncSession, project_id: uuid.UUID) -> list[tuple[User, str]]:
    """Return ``(user, role)`` pairs for a project, owner first."""
    project = await db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project not found")

    owner = await db.get(User, project.owner_id)
    members: list[tuple[User, str]] = []
    if owner is not None:
        members.append((owner, "owner"))

    stmt = (
        select(ProjectMembership, User)
        .join(User, User.id == ProjectMembership.user_id)
        .where(ProjectMembership.project_id == project_id)
        .order_by(ProjectMembership.created_at)
    )
    for membership, user in (await db.execute(stmt)).all():
        members.append((user, membership.role))
    return members


def _validate_role(role: str) -> None:
    if role not in GRANTABLE_ROLES:
        raise ValidationError(
            f"Role must be one of {', '.join(GRANTABLE_ROLES)}",
            details={"role": role},
        )


async def add_member(
    db: AsyncSession, project_id: uuid.UUID, email: str, role: str
) -> tuple[User, str]:
    """Add (or re-role) a collaborator identified by their registered email."""
    _validate_role(role)
    project = await db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project not found")

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        raise NotFoundError("No registered user with that email")
    if user.id == project.owner_id:
        raise ValidationError("The project owner already has full access")

    existing = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.role = role
    else:
        db.add(ProjectMembership(project_id=project_id, user_id=user.id, role=role))
    await db.flush()
    return user, role


async def update_member(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> tuple[User, str]:
    _validate_role(role)
    membership = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise NotFoundError("Member not found")
    membership.role = role
    await db.flush()
    user = await db.get(User, user_id)
    assert user is not None
    return user, role


async def remove_member(db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    membership = (
        await db.execute(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project_id,
                ProjectMembership.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise NotFoundError("Member not found")
    await db.delete(membership)
    await db.flush()
