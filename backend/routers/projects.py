import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from models.all_models import Project
from models.base import get_db
from schemas.projects import ProjectCreate, ProjectResponse
from services.auth_service import get_current_user

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    # Generate a unique key from the name and a random suffix
    name_prefix = "".join(word[0].upper() for word in payload.name.split() if word) or "PRJ"
    unique_suffix = uuid.uuid4().hex[:4].upper()
    key = f"{name_prefix}{unique_suffix}"

    project = Project(name=payload.name, description=payload.description, key=key)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.id).all()
