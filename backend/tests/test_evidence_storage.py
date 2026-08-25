import io

import pytest
from fastapi import HTTPException, UploadFile

from services.evidence_storage import save_evidence_image


def _upload(content: bytes, content_type: str, filename: str = "proof.png") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(content), headers={"content-type": content_type})


def test_save_evidence_image_persists_row_and_file(db_session):
    from models.all_models import Project, Release, ReleaseTestCase, ReleaseTestCaseExecution, Requirement, TestCase
    from services.code_generator import next_code
    from services.evidence_storage import UPLOADS_DIR
    import os

    project = Project(name="P", description="d", key="EV1")
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
    rtc = ReleaseTestCase(release_id=release.id, testcase_id=tc.id)
    db_session.add(rtc)
    db_session.commit()
    db_session.refresh(rtc)
    execution = ReleaseTestCaseExecution(release_test_case_id=rtc.id, result="Pass")
    db_session.add(execution)
    db_session.commit()
    db_session.refresh(execution)

    image = save_evidence_image(db_session, execution.id, release.id, tc.id, _upload(b"fake-png-bytes", "image/png"))
    db_session.commit()

    assert image.execution_id == execution.id
    assert image.file_path == f"/evidence/{release.id}/{tc.id}/{os.path.basename(image.file_path)}"
    assert image.file_path.endswith(".png")
    on_disk = os.path.join(UPLOADS_DIR, image.file_path.lstrip("/"))
    assert os.path.exists(on_disk)
    with open(on_disk, "rb") as f:
        assert f.read() == b"fake-png-bytes"
    os.remove(on_disk)


def test_save_evidence_image_rejects_non_image_content_type(db_session):
    with pytest.raises(HTTPException) as exc_info:
        save_evidence_image(db_session, 1, 1, 1, _upload(b"data", "application/pdf", filename="doc.pdf"))
    assert exc_info.value.status_code == 400


def test_save_evidence_image_rejects_oversized_file(db_session):
    huge = b"x" * (5 * 1024 * 1024 + 1)
    with pytest.raises(HTTPException) as exc_info:
        save_evidence_image(db_session, 1, 1, 1, _upload(huge, "image/png"))
    assert exc_info.value.status_code == 400
