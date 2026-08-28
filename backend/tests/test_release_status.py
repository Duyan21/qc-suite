from services.release_status import compute_release_status


def test_empty_release_is_new():
    assert compute_release_status([]) == "New"


def test_all_not_run_is_new():
    assert compute_release_status(["NotRun", "NotRun"]) == "New"


def test_any_started_but_not_all_pass_is_in_progress():
    assert compute_release_status(["Pass", "NotRun"]) == "InProgress"
    assert compute_release_status(["Pass", "Fail"]) == "InProgress"
    assert compute_release_status(["Fail"]) == "InProgress"


def test_all_pass_is_completed():
    assert compute_release_status(["Pass", "Pass"]) == "Completed"


def test_recompute_release_status_writes_to_release(db_session):
    from models.all_models import Project, Release, ReleaseTestCase, TestCase, Requirement
    from services.code_generator import next_code
    from services.release_status import recompute_release_status

    project = Project(name="P", description="d", key="RS1")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    req = Requirement(
        project_id=project.id, req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1, title="t", description="d", status="Active", is_current=True,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    tc = TestCase(code=next_code(db_session, TestCase, "code", "TC"), title="t", expected_result="e", requirement_id=req.id)
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)

    db_session.add(ReleaseTestCase(release_id=release.id, testcase_id=tc.id, current_result="Pass"))
    db_session.commit()

    recompute_release_status(db_session, release)
    assert release.status == "Completed"
