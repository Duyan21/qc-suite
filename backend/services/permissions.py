from enum import Enum

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import ProjectMember, RolePermission, User
from models.base import get_db
from services.auth_service import get_current_user


class PermissionArea(str, Enum):
    PROJECT_SETTINGS = "project_settings"
    MEMBERS_ROLES = "members_roles"
    REQUIREMENTS = "requirements"
    TEST_CASES = "test_cases"
    TEST_RUNS = "test_runs"
    DEFECTS = "defects"
    AI_TOOLS = "ai_tools"
    AUDIT_LOG = "audit_log"


_LEVEL_ORDER = {"none": 0, "read": 1, "edit": 2, "full": 3}


class PermissionLevel(str, Enum):
    NONE = "none"
    READ = "read"
    EDIT = "edit"
    FULL = "full"

    def _rank(self) -> int:
        return _LEVEL_ORDER[self.value]

    def __lt__(self, other: "PermissionLevel") -> bool:
        return self._rank() < other._rank()

    def __le__(self, other: "PermissionLevel") -> bool:
        return self._rank() <= other._rank()

    def __gt__(self, other: "PermissionLevel") -> bool:
        return self._rank() > other._rank()

    def __ge__(self, other: "PermissionLevel") -> bool:
        return self._rank() >= other._rank()

    def __eq__(self, other: object) -> bool:
        if isinstance(other, PermissionLevel):
            return self._rank() == other._rank()
        return False

    def __ne__(self, other: object) -> bool:
        return not self.__eq__(other)

    # Defining __eq__ sets __hash__ = None implicitly, which would make members
    # unusable as set entries / dict keys. Restore the str mixin's hash.
    __hash__ = str.__hash__


def get_permission_level(
    db: Session, user: User, project_id: int, area: PermissionArea
) -> PermissionLevel:
    if user.is_superadmin:
        return PermissionLevel.FULL

    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if membership is None:
        return PermissionLevel.NONE

    role_permission = (
        db.query(RolePermission)
        .filter(RolePermission.role_id == membership.role_id, RolePermission.area == area.value)
        .first()
    )
    if role_permission is None:
        return PermissionLevel.NONE

    return PermissionLevel(role_permission.level)


def is_project_member(db: Session, user: User, project_id: int) -> bool:
    """Membership-only gate, deliberately NOT routed through the permission
    matrix: `viewer` has "none" on both project_settings and members_roles, so
    gating basic project/member reads on those areas would hide a viewer's own
    project from them (and break the global project switcher)."""
    if user.is_superadmin:
        return True
    return (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
        is not None
    )


def check_permission(
    db: Session, user: User, project_id: int, area: PermissionArea, level: PermissionLevel
) -> None:
    actual = get_permission_level(db, user, project_id, area)
    if actual < level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires {level.value} on {area.value}",
        )


def require_permission(area: PermissionArea, level: PermissionLevel):
    def _dependency(
        project_id: int,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> None:
        check_permission(db, current_user, project_id, area, level)

    return _dependency


def permitted_project_ids(
    db: Session, user: User, area: PermissionArea, level: PermissionLevel
) -> set[int] | None:
    """Returns None for a superadmin (meaning: no filter, see everything).
    Otherwise returns the set of project ids where the user's role grants
    at least `level` on `area` — used by list endpoints when project_id is
    omitted from the request."""
    if user.is_superadmin:
        return None

    memberships = db.query(ProjectMember).filter(ProjectMember.user_id == user.id).all()
    if not memberships:
        return set()

    role_ids = {m.role_id for m in memberships}
    permissions = (
        db.query(RolePermission)
        .filter(RolePermission.role_id.in_(role_ids), RolePermission.area == area.value)
        .all()
    )
    allowed_role_ids = {
        rp.role_id for rp in permissions if PermissionLevel(rp.level) >= level
    }
    return {m.project_id for m in memberships if m.role_id in allowed_role_ids}
