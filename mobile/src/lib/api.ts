import { getApiBaseUrl } from '../config';

// Debug: uncomment to log API URL (helps verify config for iPhone)

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type ApiRequestOptions = {
  method?: HttpMethod;
  token?: string;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => stringifyUnknown(item)).filter(Boolean);
    return parts.join(', ');
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v.message) return stringifyUnknown(v.message);
    if (v.detail) return stringifyUnknown(v.detail);
    if (v.msg) return stringifyUnknown(v.msg);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const url = `${getApiBaseUrl()}${path}`;
  console.log('[API]', options.method ?? 'GET', url);
  let response: Response;
  try {
    response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.error('[API] FAILED', url, err);
    throw new ApiError(`Cannot reach ${url} — ${msg}`, 0);
  }

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const payload = await response.json();
      const parsed = stringifyUnknown((payload as { detail?: unknown })?.detail ?? payload);
      message = parsed || message;
    } catch {
      const plain = await response.text();
      message = plain || message;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
};
