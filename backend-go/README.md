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
cd backend
go mod tidy
go run ./cmd/api
```

Server runs on `:8000` by default.

## Env vars

- `PORT` (default `8000`)
- `JWT_SECRET` (default `dev-secret-change-me`)
- `WEB3_RPC_URL` (testnet RPC URL)
- `WEB3_CHAIN_ID` (testnet chain ID)
- `WEB3_CONTRACT_ADDRESS` (`ProofRegistry` contract address)
- `WEB3_SIGNER_PRIVATE_KEY` (server signer private key)
- `WEB3_EXPLORER_BASE_URL` (explorer base URL, example `https://sepolia.etherscan.io`)
- `WEB3_WAIT_FOR_RECEIPT` (default `true`)
- `WEB3_RECEIPT_TIMEOUT_SECONDS` (default `45`)

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
- `POST /houses/{houseID}/reports/anchor` (Manager only)
- `GET /houses/{houseID}/reports/anchors`

### Apartment scope

- `GET /apartments/{apartmentID}/summary`
- `GET /apartments/{apartmentID}/dynamics?resource=electricity&period=24h`

### Operational feeds

- `GET /alerts?house_id=house-1`
- `GET /meters?house_id=house-1`

### Web3 proof endpoints

- `POST /manager-actions/prove` (Manager only)
- `GET /manager-actions/proofs?house_id=house-1`

## Web3 proof model

This MVP uses server-attested proofing:
- Backend hashes report/action payload with `sha256`
- Backend prepares and tracks proof transactions for `ProofRegistry`
- Backend stores `status`, `tx_hash`, `block_number`, `explorer_url`
- Duplicate report anchor requests with same `house_id + period + report_hash` are idempotent

Current implementation runs in deferred mode without external Web3 dependency installation.
You can plug in a full on-chain sender later by extending `internal/web3/client.go`.
