import re
import uuid

from models.all_models import Project, Requirement, TestCase
from services.code_generator import next_code


def _create_requirement_row(db_session, **overrides):
    project = Project(name="Home Lending", description="d", key=f"DEF{uuid.uuid4().hex[:6].upper()}")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    defaults = dict(
        req_id=next_code(db_session, Requirement, "req_id", "REQ"),
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
        code=next_code(db_session, TestCase, "code", "TC"),
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


def test_create_defect_generates_code(client, auth_headers, project):
    response = client.post(
        "/defects",
        json={"title": "Login fails with OTP", "severity": "High", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert re.fullmatch(r"DEF-\d+", response.json()["code"])


def test_create_defect_requires_project_id(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_create_defect_rejects_unknown_project(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "project_id": 999999},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_create_defect_accepts_only_testcase_id(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["testcase_id"] == tc.id
    assert data["requirement_id"] is None


def test_create_defect_accepts_only_requirement_id(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "requirement_id": req.id, "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["requirement_id"] == req.id
    assert data["testcase_id"] is None


def test_create_defect_rejects_unknown_fk(client, auth_headers, project):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": 999999, "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_defects_filters_by_severity_and_status(client, auth_headers, db_session, project):
    # Scoped by testcase_id so the assertions aren't polluted by other
    # defects already committed in the shared dev DB (e.g. seed data).
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)

    d1 = client.post(
        "/defects",
        json={"title": "A", "severity": "Critical", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()
    d2 = client.post(
        "/defects",
        json={"title": "B", "severity": "Low", "status": "Closed", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects?testcase_id={tc.id}&severity=Critical", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == d1["id"]

    response = client.get(f"/defects?testcase_id={tc.id}&status=Closed", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == d2["id"]


def test_list_defects_scoped_by_project(client, auth_headers, db_session, project):
    other_project = Project(name="Other Project", description="d", key="OP1")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)

    client.post(
        "/defects",
        json={"title": "In scope", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "Out of scope", "severity": "Low", "status": "Open", "project_id": other_project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?project_id={project.id}", headers=auth_headers)
    data = response.json()
    assert all(item["project_id"] == project.id for item in data["items"])
    assert any(item["title"] == "In scope" for item in data["items"])
    assert not any(item["title"] == "Out of scope" for item in data["items"])


def test_list_defects_rejects_unknown_project(client, auth_headers):
    response = client.get("/defects?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_list_defects_search_matches_title_or_code(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    d1 = client.post(
        "/defects",
        json={"title": "Login fails with OTP", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()
    client.post(
        "/defects",
        json={"title": "Report export missing column", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?testcase_id={tc.id}&search=OTP", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == d1["id"]

    code_response = client.get(f"/defects?testcase_id={tc.id}&search={d1['code']}", headers=auth_headers)
    code_data = code_response.json()
    assert code_data["total"] == 1
    assert code_data["items"][0]["id"] == d1["id"]


def test_list_defects_includes_test_case_summary(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?testcase_id={tc.id}", headers=auth_headers)
    data = response.json()
    assert data["items"][0]["test_case"]["code"] == tc.code


def test_list_defects_omits_test_case_when_unlinked(client, auth_headers, project):
    client.post(
        "/defects",
        json={"title": "Standalone bug", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?project_id={project.id}&search=Standalone", headers=auth_headers)
    data = response.json()
    assert data["items"][0]["test_case"] is None


def test_get_defect_detail_includes_linked_summaries(client, auth_headers, db_session, project):
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
            "project_id": project.id,
        },
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"]["req_id"] == req.req_id


def test_get_defect_detail_with_only_testcase_id_omits_requirement(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"] is None


def test_get_defect_detail_with_only_requirement_id_omits_test_case(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "requirement_id": req.id, "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["requirement"]["req_id"] == req.req_id
    assert data["test_case"] is None


def test_get_defect_detail_with_no_links_omits_both(client, auth_headers, project):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"] is None
    assert data["requirement"] is None


def test_update_defect_changes_severity_status_fixed_in_version(client, auth_headers, project):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "project_id": project.id},
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


def test_delete_defect_removes_it(client, auth_headers, project):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.delete(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 204

    get_response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert get_response.status_code == 404


def test_delete_defect_missing_returns_404(client, auth_headers):
    response = client.delete("/defects/999999", headers=auth_headers)
    assert response.status_code == 404


def test_delete_defect_requires_auth(client, auth_headers, project):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.delete(f"/defects/{created['id']}")
    assert response.status_code == 401


def test_defects_require_auth(client):
    response = client.get("/defects")
    assert response.status_code == 401


def test_defect_stats_counts_by_status_and_severity_scoped_by_project(client, auth_headers, db_session, project):
    other_project = Project(name="Other Project", description="d", key="OP2")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)

    client.post(
        "/defects",
        json={"title": "A", "severity": "Critical", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "B", "severity": "Critical", "status": "Fixed", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "C", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "Other project's bug", "severity": "Critical", "status": "Open", "project_id": other_project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects/stats?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert data["by_status"] == {"Open": 2, "Fixed": 1, "Closed": 0, "Wont-Fix": 0}
    assert data["by_severity"] == {"Critical": 2, "High": 0, "Medium": 0, "Low": 1}


def test_defect_stats_rejects_unknown_project(client, auth_headers):
    response = client.get("/defects/stats?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_defect_stats_requires_project_id(client, auth_headers):
    response = client.get("/defects/stats", headers=auth_headers)
    assert response.status_code == 422
