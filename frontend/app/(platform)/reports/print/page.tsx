'use client'

import { useCallback, useEffect, useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type TxStatus = 'pending' | 'confirmed' | 'failed'

type Apartment = {
  id: string
  floor: number
  unit: number
  number: string
  score: number
  status: 'good' | 'watch' | 'alert'
  electricity_daily: number[]
  water_daily: number[]
  co2_series: number[]
  anomalies: string[]
  savings: number
}

type ReportAnchor = {
  id: string
  period: string
  report_hash: string
  tx_hash: string
  chain_id: number
  explorer_url: string
  status: TxStatus
  created_at: string
}

type MonthlyReportRow = {
  period: string
  electricity_kwh: number
  water_liters: number
  co2_avg_ppm: number
  anomaly_count: number
  apartment_count: number
}

type ReportAnomalyItem = {
  id: string
  resource: string
  severity: 'low' | 'medium' | 'high'
  title: string
  detected_at: string
}

type ReportOverview = {
  house_id: string
  house_name: string
  monthly_rows: MonthlyReportRow[]
  anomalies: ReportAnomalyItem[]
  provenance: {
    generated_at: string
    source: string
    thresholds: Record<string, Record<string, number>>
    meters_used: number
    apartments_measured: number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso }
}

const fmtNum = (n: number, decimals = 1) => n.toLocaleString('en-US', { maximumFractionDigits: decimals })

// ── Sparkline ─────────────────────────────────────────────────────────────────

const Sparkline = ({ data, color, w = 52, h = 18 }: { data: number[]; color: string; w?: number; h?: number }) => {
  if (!data.length) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className='overflow-visible'>
      <polyline
        points={pts}
        fill='none'
        stroke={color}
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

// ── MiniBar ───────────────────────────────────────────────────────────────────

const MiniBar = ({ value, max, color }: { value: number; max: number; color: string }) => {
  const pct = Math.min(100, (value / (max || 1)) * 100)
  return (
    <div className='flex items-center gap-1.5 w-full'>
      <div className='flex-1 h-1.5 rounded-full bg-slate-100'>
        <div className='h-full rounded-full' style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className='text-[9px] tabular-nums text-slate-500 w-8 text-right'>{fmtNum(value, 0)}</span>
    </div>
  )
}

// ── ScoreBadge ────────────────────────────────────────────────────────────────

const ScoreBadge = ({ score, status }: { score: number; status: string }) => {
  const cfg = {
    good: { bg: '#dcfce7', text: '#166534', ring: '#86efac' },
    watch: { bg: '#fef9c3', text: '#854d0e', ring: '#fde047' },
    alert: { bg: '#fee2e2', text: '#991b1b', ring: '#fca5a5' },
  }[status] ?? { bg: '#f1f5f9', text: '#475569', ring: '#cbd5e1' }

  return (
    <span
      className='inline-flex items-center justify-center rounded-full text-[9px] font-bold w-7 h-7'
      style={{ backgroundColor: cfg.bg, color: cfg.text, outline: `2px solid ${cfg.ring}` }}
    >
      {score}
    </span>
  )
}

// ── StatusDot ─────────────────────────────────────────────────────────────────

const StatusDot = ({ status }: { status: string }) => {
  const color = { good: '#22c55e', watch: '#eab308', alert: '#ef4444' }[status] ?? '#94a3b8'
  return (
    <span className='inline-flex items-center gap-1 text-[9px] font-semibold uppercase' style={{ color }}>
      <span className='inline-block w-1.5 h-1.5 rounded-full' style={{ backgroundColor: color }} />
      {status}
    </span>
  )
}

// ── SeverityPill ──────────────────────────────────────────────────────────────

const SeverityPill = ({ severity }: { severity: string }) => {
  const cfg = {
    high: { bg: '#fee2e2', text: '#991b1b' },
    medium: { bg: '#fef9c3', text: '#854d0e' },
    low: { bg: '#f1f5f9', text: '#475569' },
  }[severity] ?? { bg: '#f1f5f9', text: '#475569' }

  return (
    <span
      className='inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide'
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {severity}
    </span>
  )
}

// ── PrintPage ─────────────────────────────────────────────────────────────────

export default function ReportPrintPage() {
  const { accessToken, activeOrganizationId } = useAuth()
  const houseId = activeOrganizationId ?? 'house-1'

  const [overview, setOverview] = useState<ReportOverview | null>(null)
  const [anchors, setAnchors] = useState<ReportAnchor[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAll = useCallback(async () => {
    if (!accessToken) return
    try {
      const [ov, anch, apts] = await Promise.all([
        apiRequest<ReportOverview>(`/houses/${houseId}/reports/overview`, { token: accessToken }),
        apiRequest<ReportAnchor[]>(`/houses/${houseId}/reports/anchors`, { token: accessToken }),
        apiRequest<Apartment[]>(`/houses/${houseId}/apartments`, { token: accessToken }).catch(() => []),
      ])
      setOverview(ov)
      setAnchors(anch)
      setApartments(apts)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [accessToken, houseId])

  useEffect(() => { void loadAll() }, [loadAll])

  // Auto-print once data is loaded
  useEffect(() => {
    if (!loading && !error && overview) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [loading, error, overview])

  const latestAnchor = anchors[0] ?? null
  const period = new Date().toISOString().slice(0, 7)
  const maxElec = Math.max(...apartments.map((a) => Math.max(...a.electricity_daily)), 1)
  const maxWater = Math.max(...apartments.map((a) => Math.max(...a.water_daily)), 1)
  const maxMonthlyElec = Math.max(...(overview?.monthly_rows.map((r) => r.electricity_kwh) ?? [1]))
  const maxMonthlyWater = Math.max(...(overview?.monthly_rows.map((r) => r.water_liters) ?? [1]))

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className='min-h-screen flex flex-col items-center justify-center gap-4 bg-white'>
        <Spinner className='size-8 text-slate-700' />
        <p className='text-sm text-slate-500'>Preparing report…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className='min-h-screen flex flex-col items-center justify-center gap-3 bg-white p-8'>
        <p className='text-rose-600 text-sm font-medium'>{error}</p>
        <button
          type='button'
          onClick={() => void loadAll()}
          className='text-xs text-slate-500 underline'
        >
          Retry
        </button>
      </div>
    )
  }

  if (!overview) return null

  return (
    <>
      {/* Print CSS injected globally */}
      <style>{`
        @page { size: A4 landscape; margin: 12mm 14mm; }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; break-before: page; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        }
        @media screen {
          body { background: #f8fafc; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className='no-print fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-slate-900 px-6 py-3 text-white'>
        <span className='text-sm font-medium'>Report Preview — {overview.house_name}</span>
        <div className='flex gap-3'>
          <button
            type='button'
            onClick={() => window.print()}
            className='rounded-lg bg-white text-slate-900 px-4 py-1.5 text-sm font-semibold hover:bg-slate-100 transition-colors'
          >
            Save as PDF
          </button>
          <button
            type='button'
            onClick={() => window.close()}
            className='rounded-lg border border-white/30 px-4 py-1.5 text-sm hover:bg-white/10 transition-colors'
          >
            Close
          </button>
        </div>
      </div>

      {/* Report wrapper */}
      <div className='min-h-screen bg-white pt-14 print:pt-0'>
        <div className='max-w-[1050px] mx-auto px-8 py-6 print:px-0 print:py-0 print:max-w-none'>

          {/* ── PAGE 1 ──────────────────────────────────────────────────────── */}

          {/* Header */}
          <div className='avoid-break mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4'>
            <div>
              <p className='text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1'>
                Residential Management Platform
              </p>
              <h1 className='text-3xl font-black text-slate-900 leading-tight'>{overview.house_name}</h1>
              <p className='text-sm text-slate-500 mt-0.5'>Apartment Analytics Report &nbsp;·&nbsp; Period: {period}</p>
            </div>
            <div className='text-right flex flex-col items-end gap-2'>
              {latestAnchor && latestAnchor.status === 'confirmed' ? (
                <div className='flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2'>
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#16a34a' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                    <polyline points='9 12 11 14 15 10' />
                  </svg>
                  <span className='text-[10px] font-bold text-emerald-700 uppercase tracking-wide'>Verified On-Chain</span>
                </div>
              ) : (
                <div className='flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2'>
                  <span className='text-[10px] font-bold text-amber-700 uppercase tracking-wide'>Not Yet Anchored</span>
                </div>
              )}
              <p className='text-[10px] text-slate-400'>Generated {fmtDate(overview.provenance.generated_at)}</p>
              <p className='text-[10px] text-slate-400'>
                {overview.provenance.apartments_measured} apts · {overview.provenance.meters_used} meters
              </p>
            </div>
          </div>

          {/* KPI cards */}
          <div className='avoid-break grid grid-cols-5 gap-3 mb-6'>
            {[
              { label: 'Apartments', value: overview.provenance.apartments_measured, color: '#0f172a' },
              { label: 'Meters', value: overview.provenance.meters_used, color: '#0f172a' },
              { label: 'Total Anomalies', value: overview.anomalies.length, color: overview.anomalies.length > 0 ? '#dc2626' : '#16a34a' },
              { label: 'High Severity', value: overview.anomalies.filter((a) => a.severity === 'high').length, color: '#dc2626' },
              { label: 'Periods Tracked', value: overview.monthly_rows.length, color: '#0f172a' },
            ].map((kpi) => (
              <div key={kpi.label} className='rounded-xl border border-slate-200 bg-slate-50 p-3 avoid-break'>
                <p className='text-[9px] font-medium uppercase tracking-wide text-slate-400 mb-1'>{kpi.label}</p>
                <p className='text-2xl font-black' style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Monthly Consumption */}
          <div className='avoid-break mb-6'>
            <h2 className='text-xs font-bold uppercase tracking-widest text-slate-400 mb-3'>Monthly Consumption</h2>
            <div className='rounded-xl border border-slate-200 overflow-hidden'>
              <table className='w-full text-[10px]'>
                <thead>
                  <tr className='bg-slate-900 text-white'>
                    <th className='px-4 py-2.5 text-left font-semibold'>Period</th>
                    <th className='px-4 py-2.5 text-left font-semibold'>Electricity (kWh)</th>
                    <th className='px-4 py-2.5 text-left font-semibold' style={{ width: '160px' }}>Trend</th>
                    <th className='px-4 py-2.5 text-left font-semibold'>Water (L)</th>
                    <th className='px-4 py-2.5 text-left font-semibold' style={{ width: '160px' }}>Trend</th>
                    <th className='px-4 py-2.5 text-right font-semibold'>CO₂ avg</th>
                    <th className='px-4 py-2.5 text-center font-semibold'>Anomalies</th>
                    <th className='px-4 py-2.5 text-center font-semibold'>Apts</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.monthly_rows.map((row, i) => (
                    <tr key={row.period} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className='px-4 py-2.5 font-semibold text-slate-800'>{row.period}</td>
                      <td className='px-4 py-2.5 tabular-nums text-slate-700'>{fmtNum(row.electricity_kwh)}</td>
                      <td className='px-4 py-2.5'>
                        <MiniBar value={row.electricity_kwh} max={maxMonthlyElec} color='#f59e0b' />
                      </td>
                      <td className='px-4 py-2.5 tabular-nums text-slate-700'>{fmtNum(row.water_liters, 0)}</td>
                      <td className='px-4 py-2.5'>
                        <MiniBar value={row.water_liters} max={maxMonthlyWater} color='#3b82f6' />
                      </td>
                      <td className='px-4 py-2.5 text-right tabular-nums text-slate-700'>{row.co2_avg_ppm}</td>
                      <td className='px-4 py-2.5 text-center'>
                        {row.anomaly_count > 0 ? (
                          <span className='inline-block rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[8px] font-bold'>
                            {row.anomaly_count}
                          </span>
                        ) : (
                          <span className='text-slate-300'>—</span>
                        )}
                      </td>
                      <td className='px-4 py-2.5 text-center text-slate-600'>{row.apartment_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── PAGE 2 — Apartment table ───────────────────────────────────── */}
          {apartments.length > 0 && (
            <div className='page-break'>
              <h2 className='text-xs font-bold uppercase tracking-widest text-slate-400 mb-3'>
                Per-Apartment Details &nbsp;·&nbsp; {apartments.length} units
              </h2>
              <div className='rounded-xl border border-slate-200 overflow-hidden'>
                <table className='w-full text-[9.5px]'>
                  <thead>
                    <tr className='bg-slate-900 text-white'>
                      <th className='px-3 py-2.5 text-center font-semibold'>Floor</th>
                      <th className='px-3 py-2.5 text-left font-semibold'>Apt</th>
                      <th className='px-3 py-2.5 text-center font-semibold'>Status</th>
                      <th className='px-3 py-2.5 text-center font-semibold'>Score</th>
                      <th className='px-3 py-2.5 text-left font-semibold'>Electricity 24h</th>
                      <th className='px-3 py-2.5 text-left font-semibold'>Water 24h</th>
                      <th className='px-3 py-2.5 text-left font-semibold'>CO₂ 24h</th>
                      <th className='px-3 py-2.5 text-right font-semibold'>Elec avg</th>
                      <th className='px-3 py-2.5 text-right font-semibold'>Water avg</th>
                      <th className='px-3 py-2.5 text-right font-semibold'>CO₂ avg</th>
                      <th className='px-3 py-2.5 text-center font-semibold'>Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apartments
                      .slice()
                      .sort((a, b) => a.floor - b.floor || a.unit - b.unit)
                      .map((apt, i) => {
                        const elecAvg = apt.electricity_daily.reduce((s, v) => s + v, 0) / 24
                        const waterAvg = apt.water_daily.reduce((s, v) => s + v, 0) / 24
                        const co2Avg = apt.co2_series.reduce((s, v) => s + v, 0) / 24
                        const rowBg = apt.status === 'alert'
                          ? (i % 2 === 0 ? '#fff5f5' : '#fee2e2')
                          : apt.status === 'watch'
                          ? (i % 2 === 0 ? '#fffbeb' : '#fef9c3')
                          : (i % 2 === 0 ? '#ffffff' : '#f8fafc')

                        return (
                          <tr key={apt.id} style={{ backgroundColor: rowBg }}>
                            <td className='px-3 py-2 text-center font-semibold text-slate-600'>{apt.floor}</td>
                            <td className='px-3 py-2 font-mono text-slate-800'>{apt.id}</td>
                            <td className='px-3 py-2 text-center'>
                              <StatusDot status={apt.status} />
                            </td>
                            <td className='px-3 py-2 text-center'>
                              <ScoreBadge score={apt.score} status={apt.status} />
                            </td>
                            <td className='px-3 py-2'>
                              <Sparkline data={apt.electricity_daily} color='#f59e0b' />
                            </td>
                            <td className='px-3 py-2'>
                              <Sparkline data={apt.water_daily} color='#3b82f6' />
                            </td>
                            <td className='px-3 py-2'>
                              <Sparkline data={apt.co2_series} color='#8b5cf6' />
                            </td>
                            <td className='px-3 py-2 text-right tabular-nums text-slate-700'>{fmtNum(elecAvg)}</td>
                            <td className='px-3 py-2 text-right tabular-nums text-slate-700'>{fmtNum(waterAvg)}</td>
                            <td className='px-3 py-2 text-right tabular-nums text-slate-700'>{fmtNum(co2Avg, 0)}</td>
                            <td className='px-3 py-2 text-center'>
                              {apt.anomalies.length > 0 ? (
                                <span className='inline-block rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[8px] font-bold'>
                                  {apt.anomalies.length}
                                </span>
                              ) : (
                                <span className='text-slate-300'>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className='mt-3 flex gap-4 text-[9px] text-slate-500'>
                {[
                  { color: '#22c55e', label: 'Good — score ≥ 80' },
                  { color: '#eab308', label: 'Watch — score 60–79' },
                  { color: '#ef4444', label: 'Alert — score < 60' },
                ].map((item) => (
                  <span key={item.label} className='flex items-center gap-1'>
                    <span className='w-2 h-2 rounded-full inline-block' style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                ))}
                <span className='flex items-center gap-1 ml-4'>
                  <svg width='28' height='10' viewBox='0 0 28 10'><polyline points='0,9 7,4 14,7 21,2 28,5' fill='none' stroke='#f59e0b' strokeWidth='1.5' strokeLinecap='round' /></svg>
                  Electricity 24h sparkline
                </span>
                <span className='flex items-center gap-1'>
                  <svg width='28' height='10' viewBox='0 0 28 10'><polyline points='0,9 7,4 14,7 21,2 28,5' fill='none' stroke='#3b82f6' strokeWidth='1.5' strokeLinecap='round' /></svg>
                  Water 24h sparkline
                </span>
                <span className='flex items-center gap-1'>
                  <svg width='28' height='10' viewBox='0 0 28 10'><polyline points='0,9 7,4 14,7 21,2 28,5' fill='none' stroke='#8b5cf6' strokeWidth='1.5' strokeLinecap='round' /></svg>
                  CO₂ 24h sparkline
                </span>
              </div>
            </div>
          )}

          {/* ── PAGE 3 — Anomalies + Blockchain ───────────────────────────── */}
          <div className='page-break'>
            {/* Anomaly log */}
            <h2 className='text-xs font-bold uppercase tracking-widest text-slate-400 mb-3'>
              Anomaly Transparency Log &nbsp;·&nbsp; {overview.anomalies.length} events
            </h2>

            {overview.anomalies.length === 0 ? (
              <div className='rounded-xl border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400 mb-6'>
                No anomalies detected for this period
              </div>
            ) : (
              <div className='rounded-xl border border-slate-200 overflow-hidden mb-6'>
                <table className='w-full text-[10px]'>
                  <thead>
                    <tr className='bg-slate-900 text-white'>
                      <th className='px-4 py-2.5 text-left font-semibold'>Severity</th>
                      <th className='px-4 py-2.5 text-left font-semibold'>Resource</th>
                      <th className='px-4 py-2.5 text-left font-semibold'>Detected at</th>
                      <th className='px-4 py-2.5 text-left font-semibold'>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.anomalies.map((a, i) => (
                      <tr key={a.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className='px-4 py-2.5'>
                          <SeverityPill severity={a.severity} />
                        </td>
                        <td className='px-4 py-2.5 capitalize font-medium text-slate-700'>{a.resource}</td>
                        <td className='px-4 py-2.5 tabular-nums text-slate-500'>{a.detected_at}</td>
                        <td className='px-4 py-2.5 text-slate-800'>{a.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Blockchain Integrity Proof */}
            <h2 className='text-xs font-bold uppercase tracking-widest text-slate-400 mb-3'>
              Blockchain Integrity Proof
            </h2>

            {anchors.length === 0 ? (
              <div className='rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700 mb-6'>
                This report has not been anchored on-chain yet. Use &quot;Generate &amp; Anchor&quot; on the Reports page
                to permanently seal the data on Polygon Amoy.
              </div>
            ) : (
              <div className='space-y-3 mb-6'>
                {anchors.slice(0, 5).map((anchor) => (
                  <div
                    key={anchor.id}
                    className='avoid-break rounded-xl border overflow-hidden'
                    style={{
                      borderColor: anchor.status === 'confirmed' ? '#bbf7d0' : anchor.status === 'failed' ? '#fecaca' : '#fde68a',
                      backgroundColor: anchor.status === 'confirmed' ? '#f0fdf4' : anchor.status === 'failed' ? '#fff5f5' : '#fffbeb',
                    }}
                  >
                    <div className='flex items-center justify-between px-4 py-2.5 border-b' style={{
                      borderColor: anchor.status === 'confirmed' ? '#bbf7d0' : '#fecaca',
                      backgroundColor: anchor.status === 'confirmed' ? '#dcfce7' : '#fee2e2',
                    }}>
                      <div className='flex items-center gap-2'>
                        <svg width='12' height='12' viewBox='0 0 24 24' fill='none'
                          stroke={anchor.status === 'confirmed' ? '#16a34a' : '#dc2626'}
                          strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                          <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                          {anchor.status === 'confirmed' && <polyline points='9 12 11 14 15 10' />}
                        </svg>
                        <span className='text-[10px] font-bold' style={{ color: anchor.status === 'confirmed' ? '#15803d' : '#b91c1c' }}>
                          {anchor.status === 'confirmed' ? 'VERIFIED ON-CHAIN' : anchor.status.toUpperCase()}
                        </span>
                        <span className='text-[10px] text-slate-500 ml-2'>Period: {anchor.period}</span>
                      </div>
                      <span className='text-[10px] text-slate-500'>{fmtDate(anchor.created_at)}</span>
                    </div>

                    <div className='px-4 py-3 grid grid-cols-1 gap-1 font-mono text-[9px] text-slate-600'>
                      <div>
                        <span className='text-slate-400 mr-2'>Report Hash</span>
                        <span className='break-all'>{anchor.report_hash}</span>
                      </div>
                      <div>
                        <span className='text-slate-400 mr-2'>TX Hash     </span>
                        <span className='break-all'>{anchor.tx_hash}</span>
                      </div>
                      {anchor.explorer_url && (
                        <div>
                          <span className='text-slate-400 mr-2'>Explorer    </span>
                          <span className='text-blue-600'>{anchor.explorer_url}</span>
                        </div>
                      )}
                      <div>
                        <span className='text-slate-400 mr-2'>Chain       </span>
                        <span>Polygon Amoy (chain {anchor.chain_id})</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* How to verify */}
            <div className='avoid-break rounded-xl border border-slate-200 bg-slate-50 p-4'>
              <p className='text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2'>How to verify</p>
              <ol className='text-[9.5px] text-slate-600 space-y-1 list-none pl-0'>
                {[
                  'Copy the Report Hash above.',
                  'Search for the TX Hash on https://amoy.polygonscan.com',
                  'Open the transaction and click "Input Data" → switch to UTF-8 view.',
                  'The first 66 characters of the data field must match the Report Hash exactly.',
                  'The block timestamp is immutable proof of WHEN the report was sealed.',
                ].map((step, i) => (
                  <li key={i} className='flex gap-2'>
                    <span className='shrink-0 font-bold text-slate-400'>{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Footer rule */}
            <div className='mt-8 pt-4 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400'>
              <span>{overview.house_name} · {overview.provenance.source}</span>
              <span>Generated {fmtDate(overview.provenance.generated_at)}</span>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
