import pytest
from fastapi import HTTPException

from models.all_models import ProjectMember, Role, User
from services.permissions import (
    PermissionArea,
    PermissionLevel,
    check_permission,
    get_permission_level,
    permitted_project_ids,
)


def test_permission_level_ordering():
    assert PermissionLevel.NONE < PermissionLevel.READ
    assert PermissionLevel.READ < PermissionLevel.EDIT
    assert PermissionLevel.EDIT < PermissionLevel.FULL
    assert PermissionLevel.FULL >= PermissionLevel.EDIT
    assert not (PermissionLevel.READ >= PermissionLevel.EDIT)


def test_permission_level_full_comparison_matrix():
    """Verify all six comparison operators work correctly (rank-based, not lexicographic)."""
    # Verify > operator (was falling back to str's lexicographic comparison)
    assert PermissionLevel.EDIT > PermissionLevel.READ
    assert PermissionLevel.FULL > PermissionLevel.NONE
    assert not (PermissionLevel.READ > PermissionLevel.EDIT)

    # Verify <= operator (was falling back to str's lexicographic comparison)
    assert not (PermissionLevel.EDIT <= PermissionLevel.READ)
    assert PermissionLevel.NONE <= PermissionLevel.READ
    assert PermissionLevel.EDIT <= PermissionLevel.FULL
    assert PermissionLevel.EDIT <= PermissionLevel.EDIT

    # Verify == operator (rank-based equality)
    assert PermissionLevel.EDIT == PermissionLevel.EDIT
    assert PermissionLevel.NONE == PermissionLevel.NONE
    assert not (PermissionLevel.EDIT == PermissionLevel.READ)

    # Verify != operator
    assert PermissionLevel.EDIT != PermissionLevel.READ
    assert PermissionLevel.FULL != PermissionLevel.NONE
    assert not (PermissionLevel.EDIT != PermissionLevel.EDIT)


def test_superadmin_gets_full_without_membership(db_session, project):
    admin = User(email="super@example.com", hashed_password="x", is_superadmin=True)
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    level = get_permission_level(db_session, admin, project.id, PermissionArea.REQUIREMENTS)
    assert level == PermissionLevel.FULL


def test_no_membership_gets_none(db_session, project, member_user):
    level = get_permission_level(db_session, member_user, project.id, PermissionArea.REQUIREMENTS)
    assert level == PermissionLevel.NONE


def test_membership_resolves_role_permission(db_session, project, member_user, role_by_key):
    tester = role_by_key("tester")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    level = get_permission_level(db_session, member_user, project.id, PermissionArea.TEST_CASES)
    assert level == PermissionLevel.EDIT  # tester has Edit on test_cases per the seeded matrix

    level = get_permission_level(db_session, member_user, project.id, PermissionArea.MEMBERS_ROLES)
    assert level == PermissionLevel.NONE  # tester has None on members_roles


def test_check_permission_raises_403_when_insufficient(db_session, project, member_user):
    with pytest.raises(HTTPException) as exc_info:
        check_permission(db_session, member_user, project.id, PermissionArea.REQUIREMENTS, PermissionLevel.READ)
    assert exc_info.value.status_code == 403


def test_check_permission_passes_when_sufficient(db_session, project, member_user, role_by_key):
    qa_lead = role_by_key("qa_lead")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=qa_lead.id))
    db_session.commit()

    check_permission(db_session, member_user, project.id, PermissionArea.REQUIREMENTS, PermissionLevel.FULL)  # no raise


def test_permitted_project_ids_none_for_superadmin(db_session, test_user):
    result = permitted_project_ids(db_session, test_user, PermissionArea.TEST_CASES, PermissionLevel.READ)
    assert result is None


def test_permitted_project_ids_filters_by_membership(db_session, project, member_user, role_by_key):
    other_project_ids = permitted_project_ids(db_session, member_user, PermissionArea.TEST_CASES, PermissionLevel.READ)
    assert other_project_ids == set()

    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    result = permitted_project_ids(db_session, member_user, PermissionArea.TEST_CASES, PermissionLevel.READ)
    assert result == {project.id}


def test_permission_level_is_hashable():
    """A custom __eq__ without __hash__ sets __hash__ = None, which would make
    PermissionLevel unusable in sets and as dict keys."""
    assert hash(PermissionLevel.EDIT) == hash("edit")
    assert {PermissionLevel.READ, PermissionLevel.EDIT, PermissionLevel.READ} == {
        PermissionLevel.READ,
        PermissionLevel.EDIT,
    }
    assert {PermissionLevel.FULL: "ok"}[PermissionLevel.FULL] == "ok"


def test_is_project_member(db_session, project, member_user, role_by_key, test_user):
    from services.permissions import is_project_member

    assert is_project_member(db_session, member_user, project.id) is False
    assert is_project_member(db_session, test_user, project.id) is True  # superadmin

    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    # Viewer has "none" on project_settings/members_roles yet is still a member.
    assert is_project_member(db_session, member_user, project.id) is True
