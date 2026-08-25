import io

from models.all_models import Project, Release, TestCase, Requirement
from services.code_generator import next_code


def _setup_with_tc_in_release(db_session, key):
    project = Project(name="Home Lending", description="d", key=key)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    req = Requirement(project_id=project.id, req_id=next_code(db_session, Requirement, "req_id", "REQ"), version=1, title="t", description="d", status="Active", is_current=True)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    tc = TestCase(code=next_code(db_session, TestCase, "code", "TC"), title="t", expected_result="e", requirement_id=req.id)
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return project, release, tc


def test_execute_requires_test_case_to_be_in_release(client, auth_headers, db_session):
    project, release, tc = _setup_with_tc_in_release(db_session, "EX1")
    response = client.post(
        f"/releases/{release.id}/test-cases/{tc.id}/execute",
        data={"result": "Pass"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_execute_without_images_updates_current_result_and_status(client, auth_headers, db_session):
    project, release, tc = _setup_with_tc_in_release(db_session, "EX2")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc.id]}, headers=auth_headers)

    response = client.post(
        f"/releases/{release.id}/test-cases/{tc.id}/execute",
        data={"result": "Fail", "note": "OTP screen missing"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["result"] == "Fail"
    assert body["note"] == "OTP screen missing"
    assert body["images"] == []

    release_after = client.get(f"/releases/{release.id}", headers=auth_headers).json()
    assert release_after["status"] == "InProgress"
    assert release_after["fail_count"] == 1


def test_execute_with_image_persists_evidence(client, auth_headers, db_session):
    project, release, tc = _setup_with_tc_in_release(db_session, "EX3")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc.id]}, headers=auth_headers)

    response = client.post(
        f"/releases/{release.id}/test-cases/{tc.id}/execute",
        data={"result": "Pass"},
        files={"images": ("proof.png", io.BytesIO(b"fake-bytes"), "image/png")},
        headers=auth_headers,
    )
    assert response.status_code == 201
    images = response.json()["images"]
    assert len(images) == 1
    assert images[0]["url"].startswith(f"/uploads/evidence/{release.id}/{tc.id}/")


def test_execute_twice_keeps_history_and_updates_current_result(client, auth_headers, db_session):
    project, release, tc = _setup_with_tc_in_release(db_session, "EX4")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc.id]}, headers=auth_headers)

    client.post(f"/releases/{release.id}/test-cases/{tc.id}/execute", data={"result": "Fail"}, headers=auth_headers)
    client.post(f"/releases/{release.id}/test-cases/{tc.id}/execute", data={"result": "Pass"}, headers=auth_headers)

    history = client.get(f"/releases/{release.id}/test-cases/{tc.id}/executions", headers=auth_headers)
    assert history.status_code == 200
    rows = history.json()
    assert len(rows) == 2
    assert rows[0]["result"] == "Pass"  # newest first
    assert rows[1]["result"] == "Fail"

    listed = client.get(f"/releases/{release.id}/test-cases", headers=auth_headers).json()
    assert listed[0]["current_result"] == "Pass"


def test_execute_requires_edit(client, db_session, member_user):
    from conftest import make_project_member
    from services.auth_service import create_access_token

    project, release, tc = _setup_with_tc_in_release(db_session, "EX5")
    from models.all_models import User
    admin = db_session.query(User).filter(User.is_superadmin == True).first()
    admin_headers = {"Authorization": f"Bearer {create_access_token(admin.id)}"} if admin else None
    if admin_headers:
        client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc.id]}, headers=admin_headers)

    make_project_member(db_session, project, member_user, "viewer")
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post(f"/releases/{release.id}/test-cases/{tc.id}/execute", data={"result": "Pass"}, headers=headers)
    assert response.status_code == 403
