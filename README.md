# QC Suite - Software Testing Management System

Graduation thesis - UIT CDTN 25210052 & 25210112

## Stack
- Backend: FastAPI (Python 3.11+)
- Frontend: React + Vite + shadcn/ui
- Database: PostgreSQL 16 + pgvector
- LLM: Gemini 3.5 Flash
- Embedding: gemini-embedding-001

## Prerequisites
- Docker Desktop
- Python 3.11 (exactly — newer versions don't have prebuilt wheels for
  `psycopg2-binary` and fail to build without `pg_config` installed)
- Node.js >= 20.12 (LTS 22 or 24 recommended — older 20.x builds are missing
  `node:util`'s `styleText`, which Vite's `rolldown` dependency requires)

## Setup

### 1. Start database
```
docker-compose up -d
```

On a **fresh** database, enable the pgvector extension once (migrations don't do
this themselves):
```
docker exec -it qcsuite_db psql -U qcsuite -d qcsuite_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Backend
```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```
Edit `backend/.env` and fill in real values:
```
DATABASE_URL=postgresql://qcsuite:qcsuite123@localhost:5432/qcsuite_db
SECRET_KEY=<any random string, e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`>
GEMINI_API_KEY=<your Gemini API key>
```
Then apply migrations:
```
alembic upgrade head
```

### 3. Frontend
```
cd frontend
npm install
```

### 4. Root dev tooling
```
cd ..
npm install
```

## Running

One command, from the repo root (starts the db container, backend, and frontend
together via `concurrently`):
```
npm run dev
```

This assumes the backend venv and frontend `node_modules` are already set up (steps 2-3
above). Runs individually, if needed:
```
npm run dev:backend   # uvicorn --reload on :8000
npm run dev:frontend  # vite dev on :5173
```

## Branch Convention
main → production
dev  → integration
feature/* → new features (Ex: feature/s0-b-auth)
fix/*     → bug fixes