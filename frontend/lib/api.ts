export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

type HttpMethod = 'GET' | 'POST' | 'PATCH'

type ApiRequestOptions = {
  method?: HttpMethod
  token?: string
  body?: unknown
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const stringifyUnknown = (value: unknown): string => {
  if (typeof value == 'string') return value
  if (typeof value == 'number' || typeof value == 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((item) => stringifyUnknown(item)).filter(Boolean)
    return parts.join(', ')
  }
  if (value && typeof value == 'object') {
    const maybeMessage = (value as { message?: unknown }).message
    const maybeDetail = (value as { detail?: unknown }).detail
    const maybeMsg = (value as { msg?: unknown }).msg
    if (maybeMessage) return stringifyUnknown(maybeMessage)
    if (maybeDetail) return stringifyUnknown(maybeDetail)
    if (maybeMsg) return stringifyUnknown(maybeMsg)
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return ''
}

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })

  if (!response.ok) {
    let message = 'Request failed'
    try {
      const payload = await response.json()
      const parsed = stringifyUnknown(payload?.detail ?? payload)
      message = parsed || message
    } catch {
      const plain = await response.text()
      message = plain || message
    }
    throw new ApiError(message, response.status)
  }

  if (response.status == 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}
