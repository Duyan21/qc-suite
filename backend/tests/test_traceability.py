from models.all_models import Release, Requirement, TestCase, TestRun, TestRunResult
from services.code_generator import next_code


def _create_requirement(db_session, project_id, **overrides):
    defaults = dict(
        req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1,
        title="User can log in",
        description="d",
        status="Active",
        is_current=True,
        project_id=project_id,
    )
    defaults.update(overrides)
    req = Requirement(**defaults)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_test_case(db_session, requirement_id, **overrides):
    defaults = dict(
        code=next_code(db_session, TestCase, "code", "TC"),
        title="Login with valid credentials",
        expected_result="User is redirected",
        priority="High",
        status="Active",
        requirement_id=requirement_id,
    )
    defaults.update(overrides)
    tc = TestCase(**defaults)
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return tc


def _create_run_result(db_session, release_id, testcase_id, result, **overrides):
    run = TestRun(release_id=release_id, executed_by="An")
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)

    defaults = dict(run_id=run.id, testcase_id=testcase_id, result=result)
    defaults.update(overrides)
    row = TestRunResult(**defaults)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


def test_traceability_rejects_unknown_project(client, auth_headers):
    response = client.get("/traceability?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_traceability_requires_auth(client, project):
    response = client.get(f"/traceability?project_id={project.id}")
    assert response.status_code == 401


def test_traceability_flags_uncovered_requirement(client, auth_headers, project, db_session):
    _create_requirement(db_session, project.id)

    response = client.get(f"/traceability?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["is_uncovered"] is True
    assert item["coverage_percent"] == 0.0
    assert item["test_cases"] == []


def test_traceability_status_mapping_and_coverage_percent(client, auth_headers, project, db_session):
    req = _create_requirement(db_session, project.id)
    tc_pass = _create_test_case(db_session, req.id)
    tc_fail = _create_test_case(db_session, req.id)
    tc_skip = _create_test_case(db_session, req.id)
    tc_never_run = _create_test_case(db_session, req.id)

    release = Release(project_id=project.id, version_name="v1.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    _create_run_result(db_session, release.id, tc_pass.id, "Pass")
    _create_run_result(db_session, release.id, tc_fail.id, "Fail")
    _create_run_result(db_session, release.id, tc_skip.id, "Skip")

    response = client.get(f"/traceability?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["is_uncovered"] is False
    assert item["coverage_percent"] == 0.25

    statuses = {tc["code"]: tc["status"] for tc in item["test_cases"]}
    assert statuses[tc_pass.code] == "covered"
    assert statuses[tc_fail.code] == "failed"
    assert statuses[tc_skip.code] == "partial"
    assert statuses[tc_never_run.code] == "partial"


def test_traceability_latest_run_wins(client, auth_headers, project, db_session):
    req = _create_requirement(db_session, project.id)
    tc = _create_test_case(db_session, req.id)
    release = Release(project_id=project.id, version_name="v1.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    _create_run_result(db_session, release.id, tc.id, "Fail")

    second_run = TestRun(release_id=release.id, executed_by="An")
    db_session.add(second_run)
    db_session.commit()
    db_session.refresh(second_run)
    db_session.add(TestRunResult(run_id=second_run.id, testcase_id=tc.id, result="Pass"))
    db_session.commit()

    response = client.get(f"/traceability?project_id={project.id}", headers=auth_headers)
    item = response.json()["items"][0]
    assert item["test_cases"][0]["status"] == "covered"


def test_traceability_excludes_other_projects_and_old_versions(client, auth_headers, project, db_session):
    from models.all_models import Project

    other_project = Project(name="Auto Loans", description="d")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)
    _create_requirement(db_session, other_project.id)

    versioned_req_id = next_code(db_session, Requirement, "req_id", "REQ")
    old_version = _create_requirement(db_session, project.id, req_id=versioned_req_id, version=1, is_current=False)
    _create_requirement(db_session, project.id, req_id=versioned_req_id, version=2, is_current=True, previous_version_id=old_version.id)

    response = client.get(f"/traceability?project_id={project.id}", headers=auth_headers)
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["version"] == 2


def test_traceability_excludes_deprecated_test_case_after_delete(client, auth_headers, project, db_session):
    req = _create_requirement(db_session, project.id)
    tc = _create_test_case(db_session, req.id)

    delete_response = client.delete(f"/test-cases/{tc.id}", headers=auth_headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "Deprecated"

    response = client.get(f"/traceability?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    item = response.json()["items"][0]
    tc_ids = [item_tc["id"] for item_tc in item["test_cases"]]
    assert tc.id not in tc_ids
    assert item["test_cases"] == []
    assert item["is_uncovered"] is True
    assert item["coverage_percent"] == 0.0


def test_traceability_new_version_does_not_inherit_old_version_coverage(client, auth_headers, project, db_session):
    versioned_req_id = next_code(db_session, Requirement, "req_id", "REQ")
    old_version = _create_requirement(db_session, project.id, req_id=versioned_req_id, version=1, is_current=False)
    tc = _create_test_case(db_session, old_version.id)

    release = Release(project_id=project.id, version_name="v1.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    _create_run_result(db_session, release.id, tc.id, "Pass")

    _create_requirement(
        db_session,
        project.id,
        req_id=versioned_req_id,
        version=2,
        is_current=True,
        previous_version_id=old_version.id,
    )

    response = client.get(f"/traceability?project_id={project.id}", headers=auth_headers)
    data = response.json()
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["version"] == 2
    assert item["is_uncovered"] is True
    assert item["coverage_percent"] == 0.0
    assert item["test_cases"] == []
