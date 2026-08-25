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


def save_evidence_image(
    db: Session, execution_id: int, release_id: int, testcase_id: int, upload: UploadFile
) -> ExecutionEvidenceImage:
    ext = CONTENT_TYPE_EXT.get(upload.content_type)
    if ext is None:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {upload.content_type}")

    data = upload.file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 5MB limit")

    directory = os.path.join(UPLOADS_DIR, EVIDENCE_SUBDIR, str(release_id), str(testcase_id))
    os.makedirs(directory, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(directory, filename), "wb") as f:
        f.write(data)

    relative_path = f"/{EVIDENCE_SUBDIR}/{release_id}/{testcase_id}/{filename}"
    image = ExecutionEvidenceImage(execution_id=execution_id, file_path=relative_path)
    db.add(image)
    return image
