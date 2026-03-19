'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FiRefreshCw } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { TextHighlighter } from '@/components/fancy/text/text-highlighter'
import { useAuth } from '@/context/auth-context'
import { ApiError, API_BASE_URL, apiRequest } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

type AiFinding = {
  hour: string
  resource: 'electricity' | 'water' | 'co2'
  value: number
  level: 'ok' | 'warn' | 'critical'
  reason: string
}

type AiReasoning = {
  summary: string
  findings: AiFinding[]
  recommendations: string[]
}

type Metrics = {
  electricity_24h: number[]
  water_24h: number[]
  co2_24h: number[]
}

type Severity = 'low' | 'medium' | 'high'

type ApiAlert = {
  id: string
  house_name: string
  resource: string
  severity: Severity
  title: string
  detected_at: string
}

type ApartmentItem = {
  id: string
  number: string
  electricity_daily: number[]
  water_daily: number[]
  co2_series: number[]
}

type Scope = 'house' | 'apartment'

// ── Thresholds ─────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  electricity: { warn: 2.8, critical: 4.5, unit: 'kWh' },
  water: { warn: 35, critical: 55, unit: 'L' },
  co2: { warn: 800, critical: 1000, unit: 'ppm' },
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const HIGHLIGHT_CLASS = 'rounded-[0.25em] px-0.5'
const HIGHLIGHT_COLOR = '#F2AD91'
const HIGHLIGHT_PATTERN =
  /\b(\d{1,2}:\d{2}|critical|warning|warn|spike|leak|offline|peak|high|low|co2|water|electricity|gas|heating|anomaly|risk)\b/gi

const renderHighlightedText = (text: string) => {
  if (!text) return text

  HIGHLIGHT_PATTERN.lastIndex = 0
  const chunks: JSX.Element[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null = HIGHLIGHT_PATTERN.exec(text)
  let tokenIndex = 0

  while (match) {
    const [token] = match
    const start = match.index
    const end = start + token.length

    if (start > lastIndex) {
      chunks.push(<span key={`plain-${tokenIndex}`}>{text.slice(lastIndex, start)}</span>)
    }

    chunks.push(
      <TextHighlighter
        key={`hl-${tokenIndex}`}
        className={HIGHLIGHT_CLASS}
        highlightColor={HIGHLIGHT_COLOR}
      >
        {token}
      </TextHighlighter>
    )

    tokenIndex += 1
    lastIndex = end
    match = HIGHLIGHT_PATTERN.exec(text)
  }

  if (lastIndex < text.length) {
    chunks.push(<span key='plain-tail'>{text.slice(lastIndex)}</span>)
  }

  if (chunks.length === 0) return text
  return chunks
}

// ── Resource chart ─────────────────────────────────────────────────────────────

type ResourceChartProps = {
  label: string
  values: number[]
  unit: string
  warn: number
  critical: number
  findings: AiFinding[]
  resource: 'electricity' | 'water' | 'co2'
}

const ResourceChart = ({ label, values, unit, warn, critical, findings, resource }: ResourceChartProps) => {
  const data = HOURS.map((hour, i) => ({ hour, value: values[i] ?? 0 }))
  const max = Math.max(...values, 0)
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const peakHour = values.indexOf(max)

  const resourceFindings = findings.filter((f) => f.resource === resource)
  const overallLevel = resourceFindings.some((f) => f.level === 'critical')
    ? 'critical'
    : resourceFindings.some((f) => f.level === 'warn')
    ? 'warn'
    : 'ok'

  const levelDot =
    overallLevel === 'critical' ? 'bg-rose-500'
    : overallLevel === 'warn' ? 'bg-amber-400'
    : 'bg-emerald-400'

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <span className={`size-2 rounded-full ${levelDot}`} />
          <span className='text-base font-medium text-slate-900'>{label}</span>
        </div>
        <div className='flex items-center gap-3 text-sm text-slate-400'>
          <span>avg {avg.toFixed(1)}{unit}</span>
          <span>peak {max.toFixed(1)}{unit} @ {String(peakHour).padStart(2, '0')}:00</span>
        </div>
      </div>

      <div className='h-40'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f8fafc' vertical={false} />
            <XAxis
              dataKey='hour'
              interval={5}
              tick={{ fill: '#cbd5e1', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: '#cbd5e1', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{ fontSize: 13, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: 'none' }}
              formatter={(val) => [`${Number(val).toFixed(2)} ${unit}`, label]}
              labelStyle={{ color: '#64748b' }}
            />
            <ReferenceLine y={warn} stroke='#fbbf24' strokeDasharray='3 3' strokeWidth={1} />
            <ReferenceLine y={critical} stroke='#f87171' strokeDasharray='3 3' strokeWidth={1} />
            <Line
              type='monotone'
              dataKey='value'
              stroke='#0f172a'
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#0f172a' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {resourceFindings.length > 0 && (
        <div className='mt-3 space-y-1.5 border-t border-slate-100 pt-3'>
          {resourceFindings.slice(0, 3).map((f, i) => (
            <div key={i} className='flex items-start gap-2'>
              <span className={`mt-1 size-1.5 shrink-0 rounded-full ${
                f.level === 'critical' ? 'bg-rose-400' : f.level === 'warn' ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
              <p className='text-sm leading-snug text-slate-500'>
                <span className='font-medium text-slate-700'>{f.hour}</span>{' '}
                {f.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Streaming cursor blink ─────────────────────────────────────────────────────

const StreamingCursor = () => (
  <span className='inline-block w-px h-3.5 bg-slate-400 align-middle ml-0.5 animate-[blink_0.8s_step-end_infinite]' />
)

// ── Main page ──────────────────────────────────────────────────────────────────

const KnowledgeBasePage = () => {
  const { accessToken, activeOrganizationId } = useAuth()

  // Scope filter
  const [scope, setScope] = useState<Scope>('house')
  const [apartments, setApartments] = useState<ApartmentItem[]>([])
  const [selectedApt, setSelectedApt] = useState<string>('')

  // Metrics (charts) and AI streaming state
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const [reasoning, setReasoning] = useState<AiReasoning | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  // Alerts
  const [alerts, setAlerts] = useState<ApiAlert[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Load apartment list once
  useEffect(() => {
    if (!accessToken || !activeOrganizationId) return
    apiRequest<ApartmentItem[]>(`/houses/${activeOrganizationId}/apartments`, { token: accessToken })
      .then((data) => {
        setApartments(data)
        if (data.length > 0) setSelectedApt(data[0].id)
      })
      .catch(() => {})
  }, [accessToken, activeOrganizationId])

  const loadAlerts = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) return
    const data = await apiRequest<ApiAlert[]>(`/alerts?house_id=${activeOrganizationId}`, { token: accessToken })
    setAlerts(data)
  }, [accessToken, activeOrganizationId])

  const startStream = useCallback((forceRefresh = false) => {
    if (!accessToken || !activeOrganizationId) return

    // Abort any prior stream
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const params = new URLSearchParams()
    if (scope === 'apartment' && selectedApt) params.set('apartment_id', selectedApt)
    if (forceRefresh) params.set('force_refresh', 'true')
    const query = params.toString()
    const url = `${API_BASE_URL}/houses/${activeOrganizationId}/analytics/reasoning/stream${query ? `?${query}` : ''}`

    setIsStreaming(true)
    setStreamError(null)
    setStreamedText('')
    setReasoning(null)
    setMetrics(null)

    const fetchStream = async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!res.body) throw new Error('No response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })

          // Process complete SSE messages (separated by blank lines)
          const rawLines = buf.split('\n')
          buf = rawLines.pop() ?? ''

          let currentEvent = ''
          for (const line of rawLines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
              continue
            }
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') {
                setIsStreaming(false)
                setLastRefreshed(new Date())
                return
              }
              try {
                const parsed = JSON.parse(raw)
                if (currentEvent === 'metrics' || parsed.electricity_24h) {
                  setMetrics({
                    electricity_24h: parsed.electricity_24h,
                    water_24h: parsed.water_24h,
                    co2_24h: parsed.co2_24h,
                  })
                } else if (currentEvent === 'structured' || parsed.summary) {
                  setReasoning(parsed as AiReasoning)
                } else if (parsed.token !== undefined) {
                  setStreamedText((prev) => prev + parsed.token)
                }
              } catch {
                // malformed chunk – skip
              }
              currentEvent = ''
            } else if (line === '') {
              currentEvent = ''
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setStreamError((e as Error).message ?? 'Stream failed')
      } finally {
        setIsStreaming(false)
      }
    }

    void fetchStream()
  }, [accessToken, activeOrganizationId, scope, selectedApt])

  // Derive local metrics from selected apartment without re-streaming
  useEffect(() => {
    if (scope === 'apartment' && selectedApt) {
      const apt = apartments.find((a) => a.id === selectedApt)
      if (apt) {
        setMetrics({
          electricity_24h: apt.electricity_daily,
          water_24h: apt.water_daily,
          co2_24h: apt.co2_series.map(Number),
        })
      }
    }
  }, [scope, selectedApt, apartments])

  // Initial load
  useEffect(() => {
    if (!accessToken || !activeOrganizationId) return
    const boot = async () => {
      setLoading(true)
      setError(null)
      try {
        await loadAlerts()
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
      startStream()
    }
    void boot()
  }, [accessToken, activeOrganizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-stream on scope/apartment change (skip on initial mount handled above)
  const isMounted = useRef(false)
  const prevScopeRef = useRef<Scope>('house')
  const prevAptRef = useRef<string>('')
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      prevScopeRef.current = scope
      prevAptRef.current = selectedApt
      return
    }

    const scopeChanged = prevScopeRef.current !== scope
    const aptChanged = prevAptRef.current !== selectedApt
    prevScopeRef.current = scope
    prevAptRef.current = selectedApt

    // Avoid re-stream when apartment list initializes while still in "house" scope
    if (scope === 'house') {
      if (scopeChanged) startStream()
      return
    }

    // Apartment scope: stream only when scope changed or selected apartment changed
    if (scope === 'apartment') {
      if (!selectedApt) return
      if (scopeChanged || aptChanged) startStream()
    }
  }, [scope, selectedApt]) // eslint-disable-line react-hooks/exhaustive-deps

  const findings = useMemo(() => reasoning?.findings ?? [], [reasoning])

  const severityCounts = useMemo(
    () => alerts.reduce((acc, a) => { acc[a.severity] = (acc[a.severity] ?? 0) + 1; return acc }, {} as Record<string, number>),
    [alerts]
  )

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => {
      const order: Record<Severity, number> = { high: 3, medium: 2, low: 1 }
      return order[b.severity] - order[a.severity]
    }),
    [alerts]
  )

  // Extract displayed summary: prefer parsed reasoning, else streamed raw text
  const displaySummary = reasoning?.summary ?? streamedText

  return (
    <AppShell title='Resource Analytics'>
      {/* Header bar */}
      <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
        {/* Scope filter */}
        <div className='flex items-center gap-2'>
          <div className='flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm'>
            {(['house', 'apartment'] as Scope[]).map((s) => (
              <button
                key={s}
                type='button'
                onClick={() => setScope(s)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  scope === s
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {s === 'house' ? 'Whole house' : 'Apartment'}
              </button>
            ))}
          </div>

          {scope === 'apartment' && apartments.length > 0 && (
            <select
              value={selectedApt}
              onChange={(e) => setSelectedApt(e.target.value)}
              className='rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-slate-300'
            >
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  Apt {a.number}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right side: meta + refresh */}
        <div className='flex items-center gap-3'>
          <p className='text-sm text-slate-400'>
            {lastRefreshed
              ? `Updated ${lastRefreshed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : isStreaming
              ? 'Generating…'
              : 'Not loaded'}
          </p>
          <button
            type='button'
            onClick={() => startStream(true)}
            disabled={isStreaming}
            className='inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors'
          >
            <FiRefreshCw className={`size-3 ${isStreaming ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className='mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>{error}</div>
      )}

      {loading ? (
        <div className='space-y-3'>
          {[1, 2, 3].map((i) => (
            <div key={i} className='h-48 animate-pulse rounded-xl border border-slate-100 bg-slate-50' />
          ))}
        </div>
      ) : (
        <div className='space-y-5'>
          {/* Insights widget – streams token by token */}
          <div className='rounded-xl border border-slate-200 bg-white p-4'>
            <div className='mb-2 flex items-center gap-2'>
              <span className='text-xs font-semibold uppercase tracking-widest text-slate-400'>Resource insights</span>
              {isStreaming && (
                <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500'>
                  <span className='size-1.5 rounded-full bg-slate-400 animate-pulse' />
                  Generating
                </span>
              )}
            </div>

            {displaySummary ? (
              <p className='text-base leading-relaxed text-slate-700'>
                {renderHighlightedText(displaySummary)}
                {isStreaming && !reasoning && <StreamingCursor />}
              </p>
            ) : (
              <div className='h-4 w-2/3 animate-pulse rounded bg-slate-100' />
            )}

            {reasoning?.recommendations && reasoning.recommendations.length > 0 && (
              <ul className='mt-3 space-y-1 border-t border-slate-100 pt-3'>
                {reasoning.recommendations.map((r, i) => (
                  <li key={i} className='flex items-start gap-2 text-sm text-slate-500'>
                    <span className='mt-1 size-1 shrink-0 rounded-full bg-slate-400' />
                    {r}
                  </li>
                ))}
              </ul>
            )}

            {streamError && (
              <p className='mt-2 text-sm text-rose-500'>Stream error: {streamError}</p>
            )}
          </div>

          {/* Resource charts */}
          {metrics && (
            <div className='grid gap-4 lg:grid-cols-2'>
              <ResourceChart
                label='Electricity'
                values={metrics.electricity_24h}
                unit={THRESHOLDS.electricity.unit}
                warn={THRESHOLDS.electricity.warn}
                critical={THRESHOLDS.electricity.critical}
                findings={findings}
                resource='electricity'
              />
              <ResourceChart
                label='Water'
                values={metrics.water_24h}
                unit={THRESHOLDS.water.unit}
                warn={THRESHOLDS.water.warn}
                critical={THRESHOLDS.water.critical}
                findings={findings}
                resource='water'
              />
              <ResourceChart
                label='CO₂'
                values={metrics.co2_24h}
                unit={THRESHOLDS.co2.unit}
                warn={THRESHOLDS.co2.warn}
                critical={THRESHOLDS.co2.critical}
                findings={findings}
                resource='co2'
              />

              {/* Alert feed */}
              <div className='rounded-xl border border-slate-200 bg-white p-4'>
                <div className='mb-3 flex items-center justify-between'>
                  <span className='text-base font-medium text-slate-900'>Active alerts</span>
                  <div className='flex items-center gap-2 text-sm text-slate-400'>
                    {severityCounts.high > 0 && <span className='text-rose-500'>{severityCounts.high} high</span>}
                    {severityCounts.medium > 0 && <span className='text-amber-500'>{severityCounts.medium} med</span>}
                    {severityCounts.low > 0 && <span>{severityCounts.low} low</span>}
                  </div>
                </div>
                <div className='space-y-px'>
                  {sortedAlerts.length === 0 ? (
                    <p className='text-sm text-slate-400'>No active alerts.</p>
                  ) : (
                    sortedAlerts.map((alert) => {
                      const dot =
                        alert.severity === 'high' ? 'bg-rose-400'
                        : alert.severity === 'medium' ? 'bg-amber-400'
                        : 'bg-slate-300'
                      return (
                        <div key={alert.id} className='flex items-start gap-2.5 rounded-lg px-2 py-2.5 hover:bg-slate-50'>
                          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot}`} />
                          <div className='min-w-0'>
                            <p className='text-sm font-medium text-slate-800 truncate'>
                              {renderHighlightedText(alert.title)}
                            </p>
                            <p className='text-xs text-slate-400'>
                              {alert.resource} · {alert.detected_at}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hour-by-hour findings table */}
          {findings.length > 0 && (
            <div className='rounded-xl border border-slate-200 bg-white'>
              <div className='border-b border-slate-100 px-4 py-3'>
                <span className='text-base font-medium text-slate-900'>Hour-by-hour findings</span>
              </div>
              <div className='divide-y divide-slate-50'>
                {findings.map((f, i) => (
                  <div key={i} className='flex items-start gap-3 px-4 py-3'>
                    <span className='w-14 shrink-0 text-sm font-medium text-slate-400'>{f.hour}</span>
                    <span className='w-24 shrink-0 text-sm text-slate-500 capitalize'>{f.resource}</span>
                    <span className={`w-16 shrink-0 text-sm font-medium ${
                      f.level === 'critical' ? 'text-rose-500'
                      : f.level === 'warn' ? 'text-amber-500'
                      : 'text-emerald-500'
                    }`}>
                      {f.value} {THRESHOLDS[f.resource]?.unit}
                    </span>
                    <p className='text-sm text-slate-600'>
                      {renderHighlightedText(f.reason)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}

export default KnowledgeBasePage
