import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'api_base_url_override';

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

let _url = getAutoDetectedUrl();

export function getApiBaseUrl(): string {
  return _url;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  const withScheme = clean.startsWith('http') ? clean : `http://${clean}`;
  const final = withScheme.includes(':8000') ? withScheme : `${withScheme.replace(/\/+$/, '')}:8000`;
  _url = final;
  await AsyncStorage.setItem(STORAGE_KEY, final);
}

export async function loadStoredApiUrl(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) _url = stored;
}

