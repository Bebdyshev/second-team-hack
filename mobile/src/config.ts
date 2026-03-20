import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'api_base_url_override';

/** Ensures scheme and port 8000 for the FastAPI backend. */
export const normalizeApiBaseUrl = (raw: string): string => {
  const clean = raw.trim().replace(/\/+$/, '');
  const withScheme = clean.startsWith('http') ? clean : `http://${clean}`;
  return withScheme.includes(':8000')
    ? withScheme
    : `${withScheme.replace(/\/+$/, '')}:8000`;
};

function getEnvApiUrl(): string | null {
  const v = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return v ? normalizeApiBaseUrl(v) : null;
}

function getAutoDetectedUrl(): string {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;
    if (hostUri) {
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:8000`;
      }
    }
  } catch {
    /* ignore */
  }
  return 'http://localhost:8000';
}

/** Sync default before AsyncStorage loads: env override, else Expo LAN host, else localhost (simulator). */
let _url = getEnvApiUrl() ?? getAutoDetectedUrl();

export function getApiBaseUrl(): string {
  return _url;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const final = normalizeApiBaseUrl(url);
  _url = final;
  await AsyncStorage.setItem(STORAGE_KEY, final);
}

export async function loadStoredApiUrl(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    _url = normalizeApiBaseUrl(stored);
    return;
  }
  const fromEnv = getEnvApiUrl();
  if (fromEnv) {
    _url = fromEnv;
    return;
  }
  _url = getAutoDetectedUrl();
}

