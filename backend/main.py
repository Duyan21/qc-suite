from fastapi import FastAPI

from routers.auth import router as auth_router
from routers.requirements import router as requirements_router
from routers.test_runs import router as test_runs_router
from routers.test_cases import router as test_cases_router
from routers.defects import router as defects_router

app = FastAPI(title="QC Suite API")

app.include_router(auth_router)
app.include_router(requirements_router)
app.include_router(test_runs_router)
app.include_router(test_cases_router)
app.include_router(defects_router)


@app.get("/health")
def health():
    return {"status": "ok"}
