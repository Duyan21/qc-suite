import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from services.evidence_storage import UPLOADS_DIR

from models.all_models import User
from models.base import SessionLocal
from routers.auth import router as auth_router
from routers.projects import router as projects_router
from routers.releases import router as releases_router
from routers.requirements import router as requirements_router
from routers.test_cases import router as test_cases_router
from routers.defects import router as defects_router
from routers.traceability import router as traceability_router
from routers.search import router as search_router
from routers.roles import router as roles_router
from routers.users import router as users_router
from routers.modules import router as modules_router
from routers.agent import router as agent_router


def ensure_superadmin() -> None:
    """Grant is_superadmin to SUPERADMIN_EMAIL on every boot.

    The original bootstrap (first-ever registered user becomes superadmin,
    see routers/auth.py) has no recovery path if that user is ever deleted
    or the DB is reseeded — the whole system is left with zero superadmins
    and no UI path to grant one. This reconciles a known-good account on
    every startup instead of relying on registration order.
    """
    email = os.getenv("SUPERADMIN_EMAIL")
    if not email:
        return
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is not None and not user.is_superadmin:
            user.is_superadmin = True
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_superadmin()
    yield


app = FastAPI(title="QC Suite API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache"],
)

app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(releases_router)
app.include_router(requirements_router)
app.include_router(test_cases_router)
app.include_router(defects_router)
app.include_router(traceability_router)
app.include_router(search_router)
app.include_router(roles_router)
app.include_router(users_router)
app.include_router(modules_router)
app.include_router(agent_router)

os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
