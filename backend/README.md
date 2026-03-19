# Smart Home Resource Monitoring Backend Boilerplate

Clean FastAPI boilerplate for a residential building resource monitoring project.

## Tech stack
- FastAPI
- Pydantic v2
- PostgreSQL (prepared via Docker Compose)
- SQLAlchemy (ready for persistence layer integration)

## Local run
1. Copy `.env.example` to `.env`
2. Set `POSTGRES_PASSWORD` and verify `POSTGRES_URL`
3. Start services:
   - `docker compose up --build`
4. Open API docs:
   - `http://localhost:8000/docs`

## Included boilerplate endpoints
- `GET /`
- `GET /health`
- `GET /api/v1/buildings`
- `POST /api/v1/buildings`
- `GET /api/v1/meters`
- `POST /api/v1/meters`
- `GET /api/v1/metrics`
- `POST /api/v1/metrics`
- `GET /api/v1/dashboard`

## Project notes
- Current storage is in-memory to keep the template simple
- `POSTGRES_URL` is already available in settings for quick DB integration
- `lifespan` hook is prepared for startup/shutdown resources
