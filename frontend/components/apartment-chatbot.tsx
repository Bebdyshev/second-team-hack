'use client'

import { useEffect, useRef, useState } from 'react'
import { FiChevronRight, FiSend, FiX } from 'react-icons/fi'

import type { ApartmentSimulation } from '@/lib/apartment-sim'
import { HOURS } from '@/lib/apartment-sim'

export type ContextItem = {
  id: string
  label: string
  summary: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type YouTubeVideo = {
  id: string
  title: string
  channel: string
  thumbnail: string
  url: string
}

type Props = {
  apartment: ApartmentSimulation
  contextItems: ContextItem[]
  onRemoveContext: (id: string) => void
  onClose: () => void
}

// ── YouTube card ──────────────────────────────────────────────────────────────
const YouTubeCards = ({ query }: { query: string }) => {
  const [videos, setVideos] = useState<YouTubeVideo[] | null>(null)

  useEffect(() => {
    fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then(setVideos)
      .catch(() => setVideos([]))
  }, [query])

  if (videos === null)
    return (
      <div className='mt-2 space-y-2'>
        {[0, 1].map((n) => (
          <div key={n} className='flex h-16 animate-pulse gap-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100' />
        ))}
      </div>
    )

  if (videos.length === 0) return null

  return (
    <div className='mt-2 space-y-2'>
      {videos.map((v) => (
        <a
          key={v.id}
          href={v.url}
          target='_blank'
          rel='noopener noreferrer'
          className='flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-blue-300 hover:shadow-md'
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={v.thumbnail}
            alt={v.title}
            className='h-16 w-28 shrink-0 object-cover'
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`
            }}
          />
          <div className='min-w-0 flex-1 px-3 py-2'>
            <p className='line-clamp-2 text-[11px] font-semibold text-slate-900'>{v.title}</p>
            <p className='mt-0.5 text-[10px] text-slate-500'>{v.channel}</p>
          </div>
        </a>
      ))}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
const renderInline = (text: string) =>
  text.split(/(\[.+?\]\(.+?\)|\*\*.+?\*\*)/g).map((part, i) => {
    const link = part.match(/^\[(.+?)\]\((.+?)\)$/)
    if (link)
      return (
        <a
          key={i}
          href={link[2]}
          target='_blank'
          rel='noopener noreferrer'
          className='font-medium text-blue-500 underline underline-offset-2 hover:text-blue-700'
          onClick={(e) => e.stopPropagation()}
        >
          {link[1]}
        </a>
      )
    const bold = part.match(/^\*\*(.+?)\*\*$/)
    if (bold) return <strong key={i}>{bold[1]}</strong>
    return <span key={i}>{part}</span>
  })

const extractYouTubeQueries = (content: string): string[] =>
  [...content.matchAll(/youtube\.com\/results\?search_query=([^)"'\s]+)/g)].map((m) =>
    decodeURIComponent(m[1].replace(/\+/g, ' ')),
  )

const MessageContent = ({ content }: { content: string }) => {
  const youtubeQueries = extractYouTubeQueries(content)

  return (
    <div className='space-y-0.5'>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <p key={i} className='mt-2 text-[10px] font-bold uppercase tracking-widest opacity-60'>
              {line.slice(4)}
            </p>
          )
        if (line.startsWith('## '))
          return (
            <p key={i} className='mt-1.5 font-semibold'>
              {line.slice(3)}
            </p>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <div key={i} className='flex items-start gap-1.5'>
              <span className='mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-50' />
              <span>{renderInline(line.slice(2))}</span>
            </div>
          )
        if (line === '') return <div key={i} className='h-1' />
        return <p key={i}>{renderInline(line)}</p>
      })}
      {youtubeQueries.map((q) => (
        <YouTubeCards key={q} query={q} />
      ))}
    </div>
  )
}

// ── Follow-up suggestions ─────────────────────────────────────────────────────
const getFollowUps = (lastMsg: string, apt: ApartmentSimulation): string[] => {
  const m = lastMsg.toLowerCase()
  const out: string[] = []
  const peakElec = apt.electricityDaily.indexOf(Math.max(...apt.electricityDaily))
  const peakCo2 = apt.co2Series.indexOf(Math.max(...apt.co2Series))

  if (m.includes('electricity') || m.includes('kwh'))
    out.push(`What's causing the spike at ${String(peakElec).padStart(2, '0')}:00?`)
  if (m.includes('water') || m.includes('leak'))
    out.push('How to cut daily water usage?')
  if (m.includes('co2') || m.includes('air'))
    out.push(`Is ${apt.co2Series[peakCo2]} ppm CO2 dangerous?`)
  if (m.includes('score') || m.includes('eco') || m.includes('recommend'))
    out.push('What are the quickest wins for eco score?')
  if (out.length < 2)
    out.push('Any YouTube resources for energy saving?', 'Compare electricity vs water impact')
  return out.slice(0, 2)
}

// ── Main component ────────────────────────────────────────────────────────────
export const ApartmentChatbot = ({ apartment, contextItems, onRemoveContext, onClose }: Props) => {
  const storageKey = `eco-chat-${apartment.id}`

  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem(storageKey)
      return saved ? (JSON.parse(saved) as Message[]) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Persist messages to sessionStorage on every change
  useEffect(() => {
    if (messages.length > 0) sessionStorage.setItem(storageKey, JSON.stringify(messages))
  }, [messages, storageKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const liveHour = new Date().getHours()

  const buildSystemPrompt = () => {
    const hourlyTable = HOURS.map(
      (h, i) =>
        `${h}: ${apartment.electricityDaily[i].toFixed(2)}kWh | ${Math.round(apartment.waterDaily[i])}L | ${apartment.co2Series[i]}ppm CO2 | ${apartment.humiditySeries[i]}% humidity`,
    ).join('\n')

    const peakElecHour = apartment.electricityDaily.indexOf(Math.max(...apartment.electricityDaily))
    const peakWaterHour = apartment.waterDaily.indexOf(Math.max(...apartment.waterDaily))
    const peakCo2Hour = apartment.co2Series.indexOf(Math.max(...apartment.co2Series))
    const avgElec = (apartment.electricityDaily.reduce((s, v) => s + v, 0) / 24).toFixed(2)
    const avgWater = Math.round(apartment.waterDaily.reduce((s, v) => s + v, 0) / 24)

    return `You are an AI assistant embedded in EcoHouse – a smart residential building OS.

## Apartment
- ID: ${apartment.id} | Floor ${apartment.floor} | Unit ${apartment.unit} | #${apartment.number}
- Eco Score: ${apartment.score}/100 (${apartment.status.toUpperCase()})
- Projected savings: ${apartment.savings}% | Eco points: ${apartment.points}

## Live readings at ${HOURS[liveHour]}
- Electricity: ${apartment.electricityDaily[liveHour].toFixed(2)} kWh
- Water: ${Math.round(apartment.waterDaily[liveHour])} L
- CO2: ${apartment.co2Series[liveHour]} ppm | Humidity: ${apartment.humiditySeries[liveHour]}%

## Daily stats
- Electricity: avg ${avgElec} kWh | peak ${apartment.electricityDaily[peakElecHour].toFixed(2)} kWh at ${HOURS[peakElecHour]}
- Water: avg ${avgWater} L | peak ${Math.round(apartment.waterDaily[peakWaterHour])} L at ${HOURS[peakWaterHour]}
- CO2: peak ${apartment.co2Series[peakCo2Hour]} ppm at ${HOURS[peakCo2Hour]}

## Anomalies
${apartment.anomalies.length > 0 ? apartment.anomalies.map((a) => `- ${a}`).join('\n') : '- None detected'}

## Recommendations
${apartment.recommendations.map((r) => `- ${r}`).join('\n')}

## Full 24-hour data (per hour: kWh | water L | CO2 ppm | humidity %)
${hourlyTable}

## 30-day electricity (kWh/day)
${apartment.electricityMonthly.map((v, i) => `Day ${i + 1}: ${v}`).join(', ')}

## 30-day water (L/day)
${apartment.waterMonthly.map((v, i) => `Day ${i + 1}: ${v}`).join(', ')}
${contextItems.length > 0 ? `\n## User-pinned context\n${contextItems.map((c) => `### ${c.label}\n${c.summary}`).join('\n\n')}` : ''}

Instructions:
- Be concise, specific, and data-driven. Reference exact numbers.
- When giving energy/water/air tips or advice, include a YouTube search link formatted EXACTLY as: [🎥 Watch on YouTube](https://www.youtube.com/results?search_query=relevant+query+here) – use specific, relevant search terms URL-encoded with + for spaces.
- Format lists with "- " bullets and **bold** for key numbers.
- Reply in the same language the user writes in.`
  }

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: Message = { role: 'user', content }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'system', content: buildSystemPrompt() }, ...next],
        }),
      })

      if (!res.body) throw new Error('No body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
            if (delta) {
              acc += delta
              setMessages((prev) => {
                const u = [...prev]
                u[u.length - 1] = { role: 'assistant', content: acc }
                return u
              })
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not reach AI. Check connection and try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const followUps = lastAssistant && !loading ? getFollowUps(lastAssistant.content, apartment) : []

  const QUICK_PROMPTS = [
    `Summarize apartment #${apartment.number}`,
    'Any anomalies I should worry about?',
    'Top 3 recommendations?',
    'When is energy usage highest?',
  ]

  return (
    <div className='flex h-full flex-col overflow-hidden bg-white'>
      {/* Header – clean white */}
      <div className='shrink-0 border-b border-slate-200 bg-white px-4 py-3'>
        <div className='flex items-center gap-2.5'>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold text-slate-900'>AI Assistant</p>
            <p className='truncate text-[10px] text-slate-400'>
              Apt #{apartment.number} · click sections to pin context
            </p>
          </div>
          <div className='flex items-center gap-1.5'>
            <span className='flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500'>
              <span className='size-1.5 animate-pulse rounded-full bg-emerald-500' />
              Live
            </span>
            <button
              onClick={onClose}
              title='Hide panel'
              className='flex size-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700'
            >
              <FiChevronRight className='size-4' />
            </button>
          </div>
        </div>
      </div>

      {/* Context chips */}
      {contextItems.length > 0 && (
        <div className='shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2.5'>
          <p className='mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400'>📌 Pinned context</p>
          <div className='flex flex-wrap gap-1.5'>
            {contextItems.map((item) => (
              <span
                key={item.id}
                className='flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow-sm'
              >
                {item.label}
                <button
                  onClick={() => onRemoveContext(item.id)}
                  className='text-slate-400 transition-colors hover:text-slate-700'
                >
                  <FiX className='size-2.5' />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className='flex-1 overflow-y-auto bg-[#f8f9fc] px-3 py-3'>
        {messages.length === 0 && (
          <div className='space-y-2 pt-1'>
            <p className='px-1 text-[11px] font-medium text-slate-400'>Quick prompts:</p>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className='block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[11px] text-slate-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className='space-y-3 pt-1'>
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-slate-800 text-white'
                    : 'rounded-tl-sm border border-slate-200 bg-white text-slate-800 shadow-sm'
                }`}
              >
                {msg.content ? (
                  <MessageContent content={msg.content} />
                ) : (
                  loading &&
                  i === messages.length - 1 && (
                    <span className='flex gap-1 py-0.5'>
                      {[0, 1, 2].map((n) => (
                        <span
                          key={n}
                          className='size-1.5 animate-bounce rounded-full bg-slate-300'
                          style={{ animationDelay: `${n * 150}ms` }}
                        />
                      ))}
                    </span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Follow-ups */}
        {followUps.length > 0 && (
          <div className='mt-3 space-y-1.5'>
            <p className='px-1 text-[10px] font-medium text-slate-400'>Follow-up:</p>
            {followUps.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className='block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-600 shadow-sm transition-all hover:border-blue-300 hover:text-blue-700'
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className='shrink-0 border-t border-slate-200 bg-white p-3'>
        <div className='flex items-end gap-2'>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder='Ask anything… (Enter to send)'
            rows={2}
            className='flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100'
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className='flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40'
          >
            <FiSend className='size-3.5' />
          </button>
        </div>
      </div>
    </div>
  )
}
