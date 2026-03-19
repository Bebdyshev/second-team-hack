# ResMonitor Mobile

React Native (Expo) app for ResMonitor — runs on **iPhone** and **Android**.

## Prerequisites

- Node.js 18+
- npm or yarn
- **Expo Go** app on your iPhone or Android device (for testing)
- Backend running at `http://localhost:8000` (or your machine's IP for physical device)

## Quick Start

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Start the backend (in another terminal)

```bash
cd backend
source .venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn src.app:app --reload --port 8000
```

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

When testing on a **physical device**, `localhost` points to the phone, not your Mac. Update the API base URL:

1. Find your Mac's IP: `ipconfig getifaddr en0` (or `en1` if on Ethernet)
2. Edit `mobile/src/config.ts` and set:
   ```ts
   export const API_BASE_URL = 'http://YOUR_IP:8000';
   ```
   Example: `http://192.168.1.100:8000`

3. Restart the Expo dev server

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
│   ├── config.ts        # API_BASE_URL — change for physical device
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
