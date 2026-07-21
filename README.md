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
uvicorn main:app --reload

### 3. Frontend
cd frontend
npm install
npm run dev

## Branch Convention
main → production
dev  → integration
feature/* → new features (Ex: feature/s0-b-auth)
fix/*     → bug fixes