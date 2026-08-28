import os
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from models.all_models import ExecutionEvidenceImage

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
EVIDENCE_SUBDIR = "evidence"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
CONTENT_TYPE_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def validate_evidence_image(upload: UploadFile) -> tuple[bytes, str]:
    """Validate one upload and return its ``(data, ext)``. Writes nothing.

    Checks are ordered cheapest-first: content-type (no I/O), then the
    declared multipart size (so the 5MB cap is enforced *before* the body is
    read), then a defensive re-check on the bytes actually read — Starlette
    populates ``UploadFile.size`` from the part's Content-Length, but not
    every ASGI server is guaranteed to.
    """
    ext = CONTENT_TYPE_EXT.get(upload.content_type)
    if ext is None:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {upload.content_type}")

    if upload.size is not None and upload.size > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 5MB limit")

    data = upload.file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 5MB limit")

    return data, ext


def write_evidence_image(
    db: Session, execution_id: int, release_id: int, testcase_id: int, data: bytes, ext: str
) -> ExecutionEvidenceImage:
    """Write already-validated bytes to disk and stage the DB row."""
    directory = os.path.join(UPLOADS_DIR, EVIDENCE_SUBDIR, str(release_id), str(testcase_id))
    os.makedirs(directory, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(directory, filename), "wb") as f:
        f.write(data)

    relative_path = f"/{EVIDENCE_SUBDIR}/{release_id}/{testcase_id}/{filename}"
    image = ExecutionEvidenceImage(execution_id=execution_id, file_path=relative_path)
    db.add(image)
    return image


def save_evidence_image(
    db: Session, execution_id: int, release_id: int, testcase_id: int, upload: UploadFile
) -> ExecutionEvidenceImage:
    """Single-image convenience wrapper: validate then write.

    Callers handling a *batch* should validate every upload first and only
    then write, so a later invalid file can't leave earlier ones orphaned on
    disk with no DB row — see routers/releases.py::execute_release_test_case.
    """
    data, ext = validate_evidence_image(upload)
    return write_evidence_image(db, execution_id, release_id, testcase_id, data, ext)
