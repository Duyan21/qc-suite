from datetime import date, datetime, timedelta

from models.all_models import Release, ReleaseTestCase, ReleaseTestCaseExecution, Requirement, TestCase
from services.code_generator import next_code


def _create_requirement_row(db_session, project):
    req = Requirement(
        req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1,
        title="Req",
        description="d",
        status="Active",
        is_current=True,
        project_id=project.id,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_test_case_row(db_session, requirement_id):
    tc = TestCase(
        code=next_code(db_session, TestCase, "code", "TC"),
        title="Case",
        expected_result="Pass",
        priority="High",
        status="Active",
        requirement_id=requirement_id,
    )
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return tc


def test_burndown_empty_release_returns_empty_list(client, auth_headers, db_session, project):
    release = Release(project_id=project.id, version_name="v1.0.0", target_date=date.today())
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    response = client.get(f"/releases/{release.id}/burndown", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_burndown_unexecuted_test_case_stays_flat_at_total(client, auth_headers, db_session, project):
    release = Release(project_id=project.id, version_name="v1.0.0", target_date=date.today())
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    req = _create_requirement_row(db_session, project)
    tc = _create_test_case_row(db_session, req.id)
    db_session.add(ReleaseTestCase(release_id=release.id, testcase_id=tc.id))
    db_session.commit()

    response = client.get(f"/releases/{release.id}/burndown", headers=auth_headers)
    assert response.status_code == 200
    points = response.json()
    assert len(points) >= 1
    assert all(p["remaining"] == 1 for p in points)


def test_burndown_executed_test_case_drops_remaining_today(client, auth_headers, db_session, project):
    release = Release(project_id=project.id, version_name="v1.0.0", target_date=date.today())
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    req = _create_requirement_row(db_session, project)
    tc1 = _create_test_case_row(db_session, req.id)
    tc2 = _create_test_case_row(db_session, req.id)
    rtc1 = ReleaseTestCase(release_id=release.id, testcase_id=tc1.id, current_result="Pass")
    rtc2 = ReleaseTestCase(release_id=release.id, testcase_id=tc2.id)
    db_session.add_all([rtc1, rtc2])
    db_session.commit()
    db_session.refresh(rtc1)

    db_session.add(ReleaseTestCaseExecution(release_test_case_id=rtc1.id, result="Pass"))
    db_session.commit()

    response = client.get(f"/releases/{release.id}/burndown", headers=auth_headers)
    assert response.status_code == 200
    points = response.json()
    assert points[-1]["date"] == date.today().isoformat()
    assert points[-1]["remaining"] == 1


def test_burndown_requires_test_runs_read_permission(client, member_auth_headers, db_session, project):
    release = Release(project_id=project.id, version_name="v1.0.0", target_date=date.today())
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    response = client.get(f"/releases/{release.id}/burndown", headers=member_auth_headers)
    assert response.status_code == 403


def test_burndown_rejects_unknown_release(client, auth_headers):
    response = client.get("/releases/999999/burndown", headers=auth_headers)
    assert response.status_code == 404


def test_burndown_multi_day_walk_and_first_execution_only(client, auth_headers, db_session, project):
    created = datetime.utcnow() - timedelta(days=3)
    release = Release(
        project_id=project.id,
        version_name="v1.0.0",
        target_date=date.today(),
        created_at=created,
    )
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    req = _create_requirement_row(db_session, project)
    tc = _create_test_case_row(db_session, req.id)
    rtc = ReleaseTestCase(release_id=release.id, testcase_id=tc.id, current_result="Pass")
    db_session.add(rtc)
    db_session.commit()
    db_session.refresh(rtc)

    first_exec_day = created + timedelta(days=1)
    second_exec_day = created + timedelta(days=2)
    db_session.add(ReleaseTestCaseExecution(release_test_case_id=rtc.id, result="Fail", executed_at=first_exec_day))
    db_session.add(ReleaseTestCaseExecution(release_test_case_id=rtc.id, result="Pass", executed_at=second_exec_day))
    db_session.commit()

    response = client.get(f"/releases/{release.id}/burndown", headers=auth_headers)
    assert response.status_code == 200
    points = {p["date"]: p["remaining"] for p in response.json()}

    day0 = created.date().isoformat()
    day1 = first_exec_day.date().isoformat()
    day2 = second_exec_day.date().isoformat()

    assert points[day0] == 1  # not yet executed on day 0
    assert points[day1] == 0  # first execution lands here — remaining drops
    assert points[day2] == 0  # second execution on the SAME test case shouldn't change anything further
