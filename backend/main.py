from fastapi import FastAPI

from routers.auth import router as auth_router
from routers.requirements import router as requirements_router

app = FastAPI(title="QC Suite API")

app.include_router(auth_router)
app.include_router(requirements_router)


@app.get("/health")
def health():
    return {"status": "ok"}
