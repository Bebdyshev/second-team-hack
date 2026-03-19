export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
] as const

function getGroqKey(): string {
  return process.env.EXPO_PUBLIC_GROQ_API_KEY ?? ''
}

/**
 * Streams a chat completion from Groq.
 * Calls `onDelta` for each text chunk and `onDone` when finished.
 */
export const streamGroqChat = async (
  messages: ChatMessage[],
  onDelta: (chunk: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): Promise<void> => {
  const apiKey = getGroqKey()
  if (!apiKey) {
    onError('Groq API key not configured')
    return
  }

  for (const model of MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        continue
      }

      const reader = response.body?.getReader()
      if (!reader) { onError('No response body'); return }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
            if (delta) onDelta(delta)
          } catch { /* skip malformed SSE line */ }
        }
      }

      onDone()
      return
    } catch {
      continue
    }
  }

  onError('Could not reach AI — check your connection and try again.')
}
