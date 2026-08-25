from models.all_models import Project, Release, ReleaseTestCase, Requirement, TestCase
from services.code_generator import next_code
from services.release_status import recompute_release_status


def _setup(db_session, key="RTC1"):
    project = Project(name="Home Lending", description="d", key=key)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    req = Requirement(
        project_id=project.id, req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1, title="Login", description="d", status="Active", is_current=True,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    tc1 = TestCase(code=next_code(db_session, TestCase, "code", "TC"), title="TC one", expected_result="e", requirement_id=req.id)
    db_session.add(tc1)
    db_session.commit()
    db_session.refresh(tc1)

    tc2 = TestCase(code=next_code(db_session, TestCase, "code", "TC"), title="TC two", expected_result="e", requirement_id=req.id)
    db_session.add(tc2)
    db_session.commit()
    db_session.refresh(tc2)
    return project, release, req, tc1, tc2


def test_add_test_cases_by_testcase_ids(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session)
    response = client.post(
        f"/releases/{release.id}/test-cases",
        json={"testcase_ids": [tc1.id, tc2.id]},
        headers=auth_headers,
    )
    assert response.status_code == 201
    items = response.json()
    assert {item["testcase"]["id"] for item in items} == {tc1.id, tc2.id}
    assert all(item["current_result"] == "NotRun" for item in items)

    release_after = client.get(f"/releases/{release.id}", headers=auth_headers).json()
    assert release_after["total_test_cases"] == 2
    assert release_after["status"] == "New"


def test_add_test_cases_by_requirement_id_adds_linked_non_deprecated(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC2")
    tc2.status = "Deprecated"
    db_session.commit()

    response = client.post(
        f"/releases/{release.id}/test-cases",
        json={"requirement_ids": [req.id]},
        headers=auth_headers,
    )
    assert response.status_code == 201
    items = response.json()
    assert {item["testcase"]["id"] for item in items} == {tc1.id}


def test_add_test_cases_is_idempotent(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC3")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc1.id]}, headers=auth_headers)
    second = client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc1.id]}, headers=auth_headers)
    assert second.status_code == 201
    assert len(second.json()) == 0  # already present, nothing new added

    listed = client.get(f"/releases/{release.id}/test-cases", headers=auth_headers)
    assert len(listed.json()) == 1


def test_add_test_cases_rejects_empty_payload(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC4")
    response = client.post(f"/releases/{release.id}/test-cases", json={}, headers=auth_headers)
    assert response.status_code == 422


def test_add_test_cases_requires_edit(client, db_session, member_user):
    from conftest import make_project_member
    from services.auth_service import create_access_token

    project, release, req, tc1, tc2 = _setup(db_session, key="RTC5")
    make_project_member(db_session, project, member_user, "viewer")
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc1.id]}, headers=headers)
    assert response.status_code == 403


def test_list_release_test_cases_includes_requirement_summary(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC6")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc1.id]}, headers=auth_headers)

    response = client.get(f"/releases/{release.id}/test-cases", headers=auth_headers)
    assert response.status_code == 200
    item = response.json()[0]
    assert item["testcase"]["requirement"]["req_id"] == req.req_id


def test_remove_release_test_case(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC7")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc1.id]}, headers=auth_headers)

    response = client.delete(f"/releases/{release.id}/test-cases/{tc1.id}", headers=auth_headers)
    assert response.status_code == 204

    listed = client.get(f"/releases/{release.id}/test-cases", headers=auth_headers)
    assert listed.json() == []


def test_remove_release_test_case_not_found(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC8")
    response = client.delete(f"/releases/{release.id}/test-cases/{tc1.id}", headers=auth_headers)
    assert response.status_code == 404


def test_removing_last_failing_test_case_can_complete_release(client, auth_headers, db_session):
    project, release, req, tc1, tc2 = _setup(db_session, key="RTC9")
    client.post(f"/releases/{release.id}/test-cases", json={"testcase_ids": [tc1.id, tc2.id]}, headers=auth_headers)
    rtc1 = db_session.query(ReleaseTestCase).filter(ReleaseTestCase.testcase_id == tc1.id).one()
    rtc2 = db_session.query(ReleaseTestCase).filter(ReleaseTestCase.testcase_id == tc2.id).one()
    rtc1.current_result = "Pass"
    rtc2.current_result = "Fail"
    db_session.commit()
    # No execution-recording endpoint exists yet (Task 8) to keep release.status live;
    # simulate what it will do so this test exercises the removal-triggers-recompute path
    # in isolation rather than the unbuilt recording path.
    recompute_release_status(db_session, release)
    db_session.commit()

    before = client.get(f"/releases/{release.id}", headers=auth_headers).json()
    assert before["status"] == "InProgress"

    client.delete(f"/releases/{release.id}/test-cases/{tc2.id}", headers=auth_headers)

    after = client.get(f"/releases/{release.id}", headers=auth_headers).json()
    assert after["status"] == "Completed"
