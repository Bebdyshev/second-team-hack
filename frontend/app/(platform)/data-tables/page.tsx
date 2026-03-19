'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiRefreshCw } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { API_BASE_URL, ApiError, apiRequest } from '@/lib/api'

type MeterSignal = 'good' | 'weak' | 'offline'

type ApiMeter = {
  id: string
  house_id: string
  house_name: string
  resource: string
  signal_strength: MeterSignal
  last_sync: string
}

type RawMeterEvent = {
  ts: string
  meter_id: string
  house_id: string
  resource: string
  signal_strength: MeterSignal
  quality: 'ok' | 'stale' | 'drop'
  is_stale: boolean
  is_dropped: boolean
  lag_ms: number
  value: number | null
}

const MAX_RAW_ROWS = 25

const DataTablesPage = () => {
  const { accessToken, activeOrganizationId } = useAuth()
  const abortRef = useRef<AbortController | null>(null)

  const [meters, setMeters] = useState<ApiMeter[]>([])
  const [rawEvents, setRawEvents] = useState<RawMeterEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [streamOnline, setStreamOnline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('')

  const signalTone = {
    good: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    weak: 'bg-amber-100 text-amber-700 border-amber-200',
    offline: 'bg-rose-100 text-rose-700 border-rose-200',
  } as const

  const qualityTone = {
    ok: 'text-emerald-600',
    stale: 'text-amber-600',
    drop: 'text-rose-600',
  } as const

  const loadMeters = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) return
    setRefreshing(true)
    try {
      const data = await apiRequest<ApiMeter[]>(`/meters?house_id=${activeOrganizationId}`, { token: accessToken })
      setMeters(data)
      setLastUpdatedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load meters')
    } finally {
      setRefreshing(false)
    }
  }, [accessToken, activeOrganizationId])

  useEffect(() => {
    if (!accessToken || !activeOrganizationId) return
    const boot = async () => {
      setLoading(true)
      await loadMeters()
      setLoading(false)
    }
    void boot()
  }, [accessToken, activeOrganizationId, loadMeters])

  useEffect(() => {
    if (!accessToken || !activeOrganizationId) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStreamOnline(false)

    const streamUrl = `${API_BASE_URL}/meters/raw-stream?house_id=${activeOrganizationId}`

    const startStream = async () => {
      try {
        const response = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        if (!response.body) throw new Error('No response body')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        setStreamOnline(true)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            try {
              const event = JSON.parse(raw) as RawMeterEvent
              setRawEvents((prev) => [event, ...prev].slice(0, MAX_RAW_ROWS))
            } catch {
              // ignore malformed stream chunks
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message || 'Raw stream disconnected')
      } finally {
        setStreamOnline(false)
      }
    }

    void startStream()
    return () => ctrl.abort()
  }, [accessToken, activeOrganizationId])

  const summary = useMemo(() => {
    const total = rawEvents.length
    const stale = rawEvents.filter((e) => e.is_stale).length
    const drops = rawEvents.filter((e) => e.is_dropped).length
    return { total, stale, drops }
  }, [rawEvents])

  return (
    <AppShell title='Meter Fleet'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-sm text-slate-500'>
          Live meters from backend + raw telemetry stream with jitter, stale samples and dropped packets.
        </p>
        <div className='flex items-center gap-3'>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${streamOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            <span className={`size-1.5 rounded-full ${streamOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {streamOnline ? 'Stream online' : 'Stream offline'}
          </span>
          <button
            type='button'
            onClick={loadMeters}
            disabled={refreshing}
            className='inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50'
          >
            <FiRefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className='mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>
          {error}
        </div>
      )}

      <div className='mt-5 overflow-hidden rounded-lg border border-slate-200'>
        <table className='w-full border-collapse text-left text-sm'>
          <thead className='bg-slate-50 text-xs uppercase tracking-wide text-slate-500'>
            <tr>
              <th className='px-4 py-3'>Meter</th>
              <th className='px-4 py-3'>House</th>
              <th className='px-4 py-3'>Resource</th>
              <th className='px-4 py-3'>Signal</th>
              <th className='px-4 py-3'>Last Sync</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100 bg-white'>
            {loading ? (
              <tr>
                <td className='px-4 py-5 text-slate-400' colSpan={5}>Loading meters...</td>
              </tr>
            ) : meters.length === 0 ? (
              <tr>
                <td className='px-4 py-5 text-slate-400' colSpan={5}>No meters found.</td>
              </tr>
            ) : (
              meters.map((meter) => (
                <tr key={meter.id}>
                  <td className='px-4 py-3 font-medium text-slate-900'>{meter.id}</td>
                  <td className='px-4 py-3 text-slate-700'>{meter.house_name}</td>
                  <td className='px-4 py-3 text-slate-700'>{meter.resource}</td>
                  <td className='px-4 py-3'>
                    <span className={`rounded-full border px-2 py-1 text-xs ${signalTone[meter.signal_strength]}`}>
                      {meter.signal_strength}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-slate-500'>{meter.last_sync}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className='mt-5 rounded-lg border border-slate-200 bg-white'>
        <div className='flex items-center justify-between border-b border-slate-100 px-4 py-3'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium text-slate-900'>Raw telemetry stream</span>
            <span className='rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500'>
              {summary.total} events
            </span>
          </div>
          <div className='flex items-center gap-2 text-[11px] text-slate-500'>
            <span className='text-amber-600'>stale {summary.stale}</span>
            <span className='text-rose-600'>drop {summary.drops}</span>
            {lastUpdatedAt && <span>table {lastUpdatedAt}</span>}
          </div>
        </div>

        <div className='max-h-72 overflow-auto'>
          <table className='w-full border-collapse text-left text-xs'>
            <thead className='bg-slate-50 uppercase tracking-wide text-slate-500'>
              <tr>
                <th className='px-4 py-2'>TS</th>
                <th className='px-4 py-2'>Meter</th>
                <th className='px-4 py-2'>Resource</th>
                <th className='px-4 py-2'>Value</th>
                <th className='px-4 py-2'>Lag</th>
                <th className='px-4 py-2'>Quality</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100'>
              {rawEvents.length === 0 ? (
                <tr>
                  <td className='px-4 py-4 text-slate-400' colSpan={6}>Waiting for stream data...</td>
                </tr>
              ) : (
                rawEvents.map((event, idx) => (
                  <tr key={`${event.meter_id}-${event.ts}-${idx}`}>
                    <td className='px-4 py-2 text-slate-500'>{new Date(event.ts).toLocaleTimeString('ru-RU')}</td>
                    <td className='px-4 py-2 text-slate-700'>{event.meter_id}</td>
                    <td className='px-4 py-2 text-slate-700'>{event.resource}</td>
                    <td className='px-4 py-2 text-slate-700'>
                      {event.value == null ? '—' : event.value.toFixed(3)}
                    </td>
                    <td className='px-4 py-2 text-slate-700'>{event.lag_ms} ms</td>
                    <td className={`px-4 py-2 font-medium ${qualityTone[event.quality]}`}>{event.quality}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}

export default DataTablesPage
