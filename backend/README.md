# backend-go

Go backend with role-based access for two roles:
- `Manager` (управдом)
- `Resident` (резидент)

## What was extracted from frontend

From the frontend modules and data model, both roles need:
- authentication (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/me`)
- access to house-level overview and dynamics
- access to alerts/meters/reporting data for their house

Role restrictions implemented in API:
- `Manager`: full access to all apartments inside assigned house
- `Resident`: only own apartment details/dynamics, but house-level overview remains available

## Run

```bash
cd backend-go
go mod tidy
go run ./cmd/api
```

Server runs on `:8000` by default.

## Env vars

- `PORT` (default `8000`)
- `JWT_SECRET` (default `dev-secret-change-me`)

## Seed users

- Manager:
  - email: `manager@resmonitor.kz`
  - password: `manager123`
- Resident:
  - email: `resident@resmonitor.kz`
  - password: `resident123`

## API

### Auth

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `GET /auth/me`

### House scope

- `GET /houses`
- `GET /houses/{houseID}/summary`
- `GET /houses/{houseID}/dynamics?resource=electricity&period=24h`
- `GET /houses/{houseID}/apartments` (Manager only)

### Apartment scope

- `GET /apartments/{apartmentID}/summary`
- `GET /apartments/{apartmentID}/dynamics?resource=electricity&period=24h`

### Operational feeds

- `GET /alerts?house_id=house-1`
- `GET /meters?house_id=house-1`
