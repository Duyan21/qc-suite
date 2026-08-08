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
- Python >= 3.11
- Node.js >= 20

## Setup

### 1. Start database
docker-compose up -d

### 2. Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head

### 3. Frontend
cd frontend
npm install

### 4. Root dev tooling
cd ..
npm install

## Running

One command, from the repo root (starts the db container, backend, and frontend
together via `concurrently`):

npm run dev

This assumes the backend venv and frontend `node_modules` are already set up (steps 2-3
above). Runs individually, if needed:

npm run dev:backend   # uvicorn --reload on :8000
npm run dev:frontend  # vite dev on :5173

## Branch Convention
main → production
dev  → integration
feature/* → new features (Ex: feature/s0-b-auth)
fix/*     → bug fixes