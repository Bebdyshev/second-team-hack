import { getApiBaseUrl } from '../config'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Streams a chat completion through the backend /chat/stream endpoint.
 *
 * React Native's fetch does NOT support response.body.getReader() (Web Streams API),
 * so we use XMLHttpRequest.onprogress instead — same pattern used in AlertsScreen.
 *
 * Returns a cancel function that aborts the request when called.
 */
export const streamGroqChat = (
  messages: ChatMessage[],
  onDelta: (chunk: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  opts: { accessToken: string },
): (() => void) => {
  const url = `${getApiBaseUrl()}/chat/stream`
  let processedLen = 0
  let finished = false

  const processText = (text: string) => {
    const newChunk = text.slice(processedLen)
    processedLen = text.length
    if (!newChunk) return

    for (const line of newChunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        if (!finished) {
          finished = true
          onDone()
        }
        return
      }
      try {
        const parsed = JSON.parse(data) as { token?: string; error?: string }
        if (parsed.error) {
          if (!finished) {
            finished = true
            onError(parsed.error)
          }
          return
        }
        if (parsed.token) {
          onDelta(parsed.token)
        }
      } catch {
        // skip malformed SSE line
      }
    }
  }

  const xhr = new XMLHttpRequest()
  xhr.open('POST', url)
  xhr.setRequestHeader('Authorization', `Bearer ${opts.accessToken}`)
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.setRequestHeader('Accept', 'text/event-stream')

  xhr.onprogress = () => processText(xhr.responseText)

  xhr.onload = () => {
    processText(xhr.responseText)
    if (!finished) {
      finished = true
      onDone()
    }
  }

  xhr.onerror = () => {
    if (!finished) {
      finished = true
      onError('Network error — check your connection')
    }
  }

  xhr.onabort = () => {
    finished = true
  }

  xhr.send(JSON.stringify({ messages, max_tokens: 1024, temperature: 0.7 }))

  return () => xhr.abort()
}
