# ResMonitor Mobile

React Native (Expo) app for ResMonitor — runs on **iPhone** and **Android**.

## Prerequisites

- Node.js 18+
- npm or yarn
- **Expo Go** app on your iPhone or Android device (for testing)
- Backend reachable from your phone/emulator (see below — **not** only `127.0.0.1` on a real device)

## Quick Start

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Start the backend (in another terminal)

The API must listen on **all interfaces** so a phone on the same Wi‑Fi can connect. Default `uvicorn` host is `127.0.0.1` — that **blocks** LAN access.

```bash
cd backend
source .venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn src.app:app --reload --port 8000 --host 0.0.0.0
```

Or use `backend/START_BACKEND.command` (macOS) — it already uses `--host 0.0.0.0` and prints your LAN IP.

**Check:** from the phone’s Safari, open `http://YOUR_MAC_IP:8000/docs` — if it does not load, fix firewall / Wi‑Fi / host before debugging the app.

### 3. Run the mobile app

```bash
cd mobile
npm start
# or: npx expo start
```

### 4. Run on your device

- **iPhone (Expo Go):** Scan the QR code with your iPhone camera, or press `i` in the terminal to open iOS Simulator
- **Android:** Scan the QR code with Expo Go, or press `a` for Android emulator

## Testing on iPhone

1. Install **Expo Go** from the App Store
2. Ensure your iPhone and Mac are on the same Wi‑Fi
3. Run `npm start` in the mobile folder
4. Scan the QR code with your iPhone camera — it will open in Expo Go

### Physical device: API URL

On a **physical phone**, `localhost` / `127.0.0.1` is the **phone itself**, not your computer. The app auto-uses the Expo dev server host (your Mac’s LAN IP) when possible; if requests fail (`Network request failed` on `/auth/refresh` or chat):

1. Mac and phone on the **same Wi‑Fi** (guest networks often isolate clients).
2. Backend: `uvicorn ... --host 0.0.0.0` (see above).
3. **Set the API URL in the app:** Login screen → **“Network failed? Set API server”** → enter your Mac’s IP, e.g. `192.168.1.105` (find it: System Settings → Network, or `ipconfig getifaddr en0`).
4. Optional: copy `mobile/.env.example` to `mobile/.env` and set  
   `EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_IP:8000`  
   then restart Expo (`npx expo start -c`).

Saved URL is stored in AsyncStorage; change it again if your Mac gets a new IP on another network.

## Screens

| Screen      | Role     | Description                    |
|------------|----------|--------------------------------|
| Login      | All      | Sign in / Register             |
| Overview   | All      | Dashboard (KPIs, resources)    |
| Eco Quests | Resident | 7 quests, plant growth, streaks|
| Tickets    | Resident | Complaints, create new         |
| Alerts     | All      | Resource alerts                |
| Meters     | All      | Meter health                   |

## Seed users (backend)

- **Manager:** `manager@resmonitor.kz` / `manager123`
- **Resident:** `resident@resmonitor.kz` / `resident123`
- **Resident 2:** `resident2@resmonitor.kz` / `resident123`

## Scripts

```bash
npm start      # Start Expo dev server
npm run ios    # Open in iOS Simulator
npm run android # Open in Android emulator
```

## Project structure

```
mobile/
├── App.tsx              # Entry, providers, navigation
├── src/
│   ├── config.ts        # API base URL (Expo LAN / .env / login override)
│   ├── context/
│   │   └── AuthContext.tsx
│   ├── lib/
│   │   └── api.ts
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── EcoQuestsScreen.tsx
│   │   ├── TicketsScreen.tsx
│   │   ├── AlertsScreen.tsx
│   │   └── MetersScreen.tsx
│   └── types.ts
├── assets/
│   └── plant-growth/   # 1.png–7.png for eco quest plant
└── app.json
```
