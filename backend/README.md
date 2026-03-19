# ResMonitor FastAPI Backend

Backend migrated from LMS domain to residential building management.

## Roles

- `Manager` (управдом)
- `Resident` (резидент)

## Run

```bash
cd backend
source .venv/bin/activate  # or: venv\Scripts\activate on Windows
uvicorn src.app:app --reload --port 8000 --host 0.0.0.0
```

**For mobile testing on physical iPhone:** Use `--host 0.0.0.0` so the phone can reach the backend. Then set your Mac's IP in `mobile/src/config.ts` (run `ipconfig getifaddr en0` to get it).

## PostgreSQL (Tickets & Tasks)

Tickets and daily tasks are persisted in PostgreSQL when `POSTGRES_URL` is set in `.env`. This enables:

- Resident ticket history across devices
- Task status (To Do / In Progress / Done) saved
- Ticket–task sync (manager actions update resident tickets)

If `POSTGRES_URL` is not set, the app falls back to in-memory storage (data lost on restart).

## Seed Users

- Manager: `manager@resmonitor.kz` / `manager123`
- Resident: `resident@resmonitor.kz` / `resident123` (apt-804)
- Resident: `resident2@resmonitor.kz` / `resident123` (apt-502)

## Main Endpoints

- Auth:
  - `POST /auth/login`
  - `POST /auth/register`
  - `POST /auth/refresh`
  - `GET /auth/me`
- House:
  - `GET /houses`
  - `GET /houses/{house_id}/summary`
  - `GET /houses/{house_id}/dynamics?resource=electricity&period=24h`
  - `GET /houses/{house_id}/apartments` (manager only)
- Apartment:
  - `GET /apartments/{apartment_id}/summary`
  - `GET /apartments/{apartment_id}/dynamics?resource=electricity&period=24h`
- Monitoring:
  - `GET /alerts`
  - `GET /meters`
- Web3 proofing (server-attested):
  - `POST /houses/{house_id}/reports/anchor`
  - `GET /houses/{house_id}/reports/anchors`
  - `POST /manager-actions/prove`
  - `GET /manager-actions/proofs`
