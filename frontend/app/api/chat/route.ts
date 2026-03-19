import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const { messages } = await req.json()
  const models = [
    'llama-3.3-70b-versatile', // main
    'meta-llama/llama-4-scout-17b-16e-instruct', // fallback 1
    'llama-3.1-8b-instant', // fallback 2
  ] as const

  let lastErrorText = 'Groq request failed'
  let lastStatus = 500

  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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

      if (response.ok) {
        return new Response(response.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Groq-Model-Used': model,
          },
        })
      }

      lastStatus = response.status
      lastErrorText = await response.text()
    } catch (error) {
      lastStatus = 500
      lastErrorText = error instanceof Error ? error.message : 'Unknown Groq fetch error'
    }
  }

  return new Response(lastErrorText, { status: lastStatus })
}
