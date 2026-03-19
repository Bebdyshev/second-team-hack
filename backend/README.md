# ResMonitor FastAPI Backend

Backend migrated from LMS domain to residential building management.

## Roles

- `Manager` (управдом)
- `Resident` (резидент)

## Run

```bash
cd backend
pip install -r requirements.txt
uvicorn src.app:app --reload --port 8000
```

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
