from models.all_models import Project, Requirement, TestCase


def _create_requirement_row(db_session, **overrides):
    project = Project(name="Home Lending", description="d")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    defaults = dict(
        req_id="REQ-001",
        version=1,
        title="User can log in",
        description="d",
        status="Active",
        is_current=True,
        project_id=project.id,
    )
    defaults.update(overrides)
    req = Requirement(**defaults)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_test_case_row(db_session, requirement_id, **overrides):
    defaults = dict(
        code="TC-001",
        title="Login with valid credentials",
        expected_result="User is redirected",
        priority="High",
        status="Draft",
        requirement_id=requirement_id,
    )
    defaults.update(overrides)
    tc = TestCase(**defaults)
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return tc


def test_create_defect_generates_code(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Login fails with OTP", "severity": "High", "status": "Open"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["code"] == "DEF-001"


def test_create_defect_accepts_only_testcase_id(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": tc.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["testcase_id"] == tc.id
    assert data["requirement_id"] is None


def test_create_defect_accepts_only_requirement_id(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "requirement_id": req.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["requirement_id"] == req.id
    assert data["testcase_id"] is None


def test_create_defect_rejects_unknown_fk(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": 999999},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_defects_filters_by_severity_and_status(client, auth_headers):
    client.post("/defects", json={"title": "A", "severity": "Critical", "status": "Open"}, headers=auth_headers)
    client.post("/defects", json={"title": "B", "severity": "Low", "status": "Closed"}, headers=auth_headers)

    response = client.get("/defects?severity=Critical", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["severity"] == "Critical"

    response = client.get("/defects?status=Closed", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Closed"


def test_get_defect_detail_includes_linked_summaries(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    created = client.post(
        "/defects",
        json={
            "title": "Bug",
            "severity": "High",
            "status": "Open",
            "testcase_id": tc.id,
            "requirement_id": req.id,
        },
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"]["req_id"] == req.req_id


def test_get_defect_detail_with_only_testcase_id_omits_requirement(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "testcase_id": tc.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"] is None


def test_get_defect_detail_with_only_requirement_id_omits_test_case(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "requirement_id": req.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["requirement"]["req_id"] == req.req_id
    assert data["test_case"] is None


def test_get_defect_detail_with_no_links_omits_both(client, auth_headers):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open"},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"] is None
    assert data["requirement"] is None


def test_update_defect_changes_severity_status_fixed_in_version(client, auth_headers):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open"},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/defects/{created['id']}",
        json={"severity": "Critical", "status": "Fixed", "fixed_in_version": "v2.1.0"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["severity"] == "Critical"
    assert data["status"] == "Fixed"
    assert data["fixed_in_version"] == "v2.1.0"


def test_defects_require_auth(client):
    response = client.get("/defects")
    assert response.status_code == 401
