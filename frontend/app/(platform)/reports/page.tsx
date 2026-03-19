'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiRefreshCw, FiExternalLink, FiCopy, FiCheck, FiShield, FiAlertTriangle, FiActivity, FiDatabase } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type TxStatus = 'pending' | 'confirmed' | 'failed'

type ReportAnchor = {
  id: string
  period: string
  report_hash: string
  tx_hash: string
  chain_id: number
  contract_address: string
  explorer_url: string
  triggered_by: string
  status: TxStatus
  created_at: string
  error_message: string
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

type ReportProvenance = {
  generated_at: string
  source: string
  thresholds: Record<string, Record<string, number>>
  meters_used: number
  apartments_measured: number
}

type ReportOverview = {
  house_id: string
  house_name: string
  monthly_rows: MonthlyReportRow[]
  anomalies: ReportAnomalyItem[]
  provenance: ReportProvenance
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

const RESOURCE_LABELS: Record<string, string> = {
  electricity: 'Electricity',
  water: 'Water',
  gas: 'Gas',
  heating: 'Heating',
  co2: 'CO₂',
}

const STATUS_STYLES: Record<TxStatus, string> = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
}

const STATUS_LABELS: Record<TxStatus, string> = {
  confirmed: 'Verified on-chain',
  pending: 'Pending',
  failed: 'Failed',
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const fmtHash = (hash: string, len = 14) => `${hash.slice(0, len)}…`

// ── CopyButton ────────────────────────────────────────────────────────────────

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type='button'
      onClick={handleCopy}
      aria-label='Copy to clipboard'
      className='ml-1 inline-flex items-center text-slate-400 hover:text-slate-700 transition-colors'
    >
      {copied ? <FiCheck size={11} className='text-emerald-500' /> : <FiCopy size={11} />}
    </button>
  )
}

// ── ProvenanceBlock ───────────────────────────────────────────────────────────

const ProvenanceBlock = ({ prov }: { prov: ReportProvenance }) => (
  <section className='mt-6 rounded-xl border border-slate-200 bg-white p-5'>
    <div className='mb-3 flex items-center gap-2'>
      <FiDatabase size={14} className='text-slate-500' />
      <h2 className='text-sm font-semibold text-slate-900'>How this report is calculated</h2>
    </div>
    <p className='text-sm text-slate-600 leading-relaxed'>{prov.source}</p>
    <div className='mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm'>
      <div className='rounded-lg bg-slate-50 p-3'>
        <p className='text-xs text-slate-400 mb-1'>Generated at</p>
        <p className='font-medium text-slate-800 text-xs'>{fmtDate(prov.generated_at)}</p>
      </div>
      <div className='rounded-lg bg-slate-50 p-3'>
        <p className='text-xs text-slate-400 mb-1'>Meters used</p>
        <p className='font-medium text-slate-800'>{prov.meters_used}</p>
      </div>
      <div className='rounded-lg bg-slate-50 p-3'>
        <p className='text-xs text-slate-400 mb-1'>Apartments measured</p>
        <p className='font-medium text-slate-800'>{prov.apartments_measured}</p>
      </div>
      <div className='rounded-lg bg-slate-50 p-3'>
        <p className='text-xs text-slate-400 mb-1'>Resources tracked</p>
        <p className='font-medium text-slate-800'>{Object.keys(prov.thresholds).length}</p>
      </div>
    </div>
    {Object.keys(prov.thresholds).length > 0 && (
      <div className='mt-3'>
        <p className='text-xs font-medium text-slate-500 mb-2'>Anomaly thresholds</p>
        <div className='flex flex-wrap gap-2'>
          {Object.entries(prov.thresholds).map(([res, levels]) => (
            <span
              key={res}
              className='rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700'
            >
              <span className='font-medium capitalize'>{RESOURCE_LABELS[res] ?? res}</span>
              {' — '}warn: {levels.warn} · critical: {levels.critical}
            </span>
          ))}
        </div>
      </div>
    )}
  </section>
)

// ── ReportsPage ───────────────────────────────────────────────────────────────

const ReportsPage = () => {
  const { accessToken, activeOrganizationId, activeRole } = useAuth()
  const isManager = activeRole === 'Manager'

  const activeHouseId = activeOrganizationId ?? 'house-1'

  const [overview, setOverview] = useState<ReportOverview | null>(null)
  const [anchors, setAnchors] = useState<ReportAnchor[]>([])
  const [isLoadingOverview, setIsLoadingOverview] = useState(false)
  const [isLoadingAnchors, setIsLoadingAnchors] = useState(false)
  const [overviewError, setOverviewError] = useState('')
  const [anchorsError, setAnchorsError] = useState('')
  const [isAnchoring, setIsAnchoring] = useState(false)
  const [anchorError, setAnchorError] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<string | 'all'>('all')

  const filteredRows = useMemo(() => {
    if (!overview) return []
    if (selectedPeriod === 'all') return overview.monthly_rows
    return overview.monthly_rows.filter((row) => row.period === selectedPeriod)
  }, [overview, selectedPeriod])

  const allAnomalies = useMemo(() => {
    if (!overview) return []
    return overview.anomalies
  }, [overview])

  const latestPeriod = useMemo(
    () => overview?.monthly_rows.at(-1)?.period ?? new Date().toISOString().slice(0, 7),
    [overview],
  )

  const loadOverview = useCallback(async () => {
    if (!accessToken) return
    setIsLoadingOverview(true)
    setOverviewError('')
    try {
      const data = await apiRequest<ReportOverview>(`/houses/${activeHouseId}/reports/overview`, {
        token: accessToken,
      })
      setOverview(data)
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : 'Failed to load report overview')
    } finally {
      setIsLoadingOverview(false)
    }
  }, [accessToken, activeHouseId])

  const loadAnchors = useCallback(async () => {
    if (!accessToken) return
    setIsLoadingAnchors(true)
    setAnchorsError('')
    try {
      const data = await apiRequest<ReportAnchor[]>(`/houses/${activeHouseId}/reports/anchors`, {
        token: accessToken,
      })
      setAnchors(data)
    } catch (err) {
      setAnchorsError(err instanceof ApiError ? err.message : 'Failed to load proof history')
    } finally {
      setIsLoadingAnchors(false)
    }
  }, [accessToken, activeHouseId])

  const handleRefresh = useCallback(() => {
    void loadOverview()
    void loadAnchors()
  }, [loadOverview, loadAnchors])

  const handleAnchor = async () => {
    if (!accessToken) return
    setIsAnchoring(true)
    setAnchorError('')
    try {
      await apiRequest<ReportAnchor>(`/houses/${activeHouseId}/reports/anchor`, {
        method: 'POST',
        token: accessToken,
        body: { period: latestPeriod, metadata_uri: `report://${activeHouseId}/${latestPeriod}` },
      })
      await loadAnchors()
    } catch (err) {
      setAnchorError(err instanceof ApiError ? err.message : 'Failed to anchor report')
    } finally {
      setIsAnchoring(false)
    }
  }

  useEffect(() => {
    void loadOverview()
    void loadAnchors()
  }, [loadOverview, loadAnchors])

  const totalAnomalies = overview?.anomalies.length ?? 0
  const highCount = overview?.anomalies.filter((a) => a.severity === 'high').length ?? 0

  return (
    <AppShell title='Transparency Reports'>
      {/* Header */}
      <div className='flex flex-wrap items-start justify-between gap-3 mb-1'>
        <div>
          <p className='text-sm text-slate-500 mt-0.5'>
            Full audit trail for residents — monthly consumption, anomaly log, and on-chain proof anchors.
          </p>
        </div>
        <button
          type='button'
          onClick={handleRefresh}
          disabled={isLoadingOverview || isLoadingAnchors}
          aria-label='Refresh reports'
          className='flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors'
        >
          <FiRefreshCw size={12} className={isLoadingOverview ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Row */}
      {overview && (
        <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <div className='rounded-xl border border-slate-200 bg-white p-4'>
            <p className='text-xs text-slate-400 mb-1'>House</p>
            <p className='text-sm font-semibold text-slate-900'>{overview.house_name}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4'>
            <p className='text-xs text-slate-400 mb-1'>Periods tracked</p>
            <p className='text-xl font-bold text-slate-900'>{overview.monthly_rows.length}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4'>
            <p className='text-xs text-slate-400 mb-1'>Total anomalies</p>
            <p className='text-xl font-bold text-slate-900'>{totalAnomalies}</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4'>
            <p className='text-xs text-slate-400 mb-1'>High severity</p>
            <p className={`text-xl font-bold ${highCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{highCount}</p>
          </div>
        </div>
      )}

      {overviewError && (
        <p className='mt-4 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700'>{overviewError}</p>
      )}

      {/* Monthly Breakdown */}
      <section className='mt-6 rounded-xl border border-slate-200 bg-white'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3'>
          <div className='flex items-center gap-2'>
            <FiActivity size={14} className='text-slate-500' />
            <h2 className='text-sm font-semibold text-slate-900'>Monthly breakdown</h2>
          </div>
          {overview && overview.monthly_rows.length > 0 && (
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              aria-label='Filter by period'
              className='rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300'
            >
              <option value='all'>All periods</option>
              {overview.monthly_rows.map((row) => (
                <option key={row.period} value={row.period}>
                  {row.period}
                </option>
              ))}
            </select>
          )}
        </div>

        {isLoadingOverview ? (
          <div className='h-36 flex items-center justify-center text-sm text-slate-400'>Loading data…</div>
        ) : filteredRows.length === 0 ? (
          <div className='h-36 flex items-center justify-center text-sm text-slate-400'>No data available</div>
        ) : (
          <div className='h-[260px] overflow-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='sticky top-0 z-10 bg-white border-b border-slate-100'>
                  <th className='px-5 py-2.5 text-left text-xs font-medium text-slate-500'>Period</th>
                  <th className='px-5 py-2.5 text-right text-xs font-medium text-slate-500'>Electricity (kWh)</th>
                  <th className='px-5 py-2.5 text-right text-xs font-medium text-slate-500'>Water (L)</th>
                  <th className='px-5 py-2.5 text-right text-xs font-medium text-slate-500'>CO₂ avg (ppm)</th>
                  <th className='px-5 py-2.5 text-right text-xs font-medium text-slate-500'>Anomalies</th>
                  <th className='px-5 py-2.5 text-right text-xs font-medium text-slate-500'>Apartments</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.period} className='border-b border-slate-50 hover:bg-slate-50 transition-colors'>
                    <td className='px-5 py-3 font-medium text-slate-800'>{row.period}</td>
                    <td className='px-5 py-3 text-right text-slate-700 tabular-nums'>{row.electricity_kwh.toLocaleString()}</td>
                    <td className='px-5 py-3 text-right text-slate-700 tabular-nums'>{row.water_liters.toLocaleString()}</td>
                    <td className='px-5 py-3 text-right text-slate-700 tabular-nums'>{row.co2_avg_ppm}</td>
                    <td className='px-5 py-3 text-right'>
                      {row.anomaly_count > 0 ? (
                        <span className='rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'>
                          {row.anomaly_count}
                        </span>
                      ) : (
                        <span className='text-slate-400'>—</span>
                      )}
                    </td>
                    <td className='px-5 py-3 text-right text-slate-600'>{row.apartment_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Anomaly Log */}
      <section className='mt-4 rounded-xl border border-slate-200 bg-white'>
        <div className='flex items-center gap-2 border-b border-slate-100 px-5 py-3'>
          <FiAlertTriangle size={14} className='text-slate-500' />
          <h2 className='text-sm font-semibold text-slate-900'>Anomaly transparency log</h2>
          {allAnomalies.length > 0 && (
            <span className='ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'>
              {allAnomalies.length}
            </span>
          )}
        </div>

        {isLoadingOverview ? (
          <div className='h-36 flex items-center justify-center text-sm text-slate-400'>Loading…</div>
        ) : allAnomalies.length === 0 ? (
          <div className='h-24 flex items-center justify-center text-sm text-slate-400'>No anomalies detected</div>
        ) : (
          <div className='h-[220px] overflow-auto divide-y divide-slate-50'>
            {allAnomalies.map((item) => (
              <div key={item.id} className='flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors'>
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_STYLES[item.severity]}`}
                >
                  {item.severity}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm text-slate-800 font-medium truncate'>{item.title}</p>
                  <p className='text-xs text-slate-400 mt-0.5'>
                    {RESOURCE_LABELS[item.resource] ?? item.resource} · detected at {item.detected_at}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* On-chain proof history */}
      <section className='mt-4 rounded-xl border border-slate-200 bg-white'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3'>
          <div className='flex items-center gap-2'>
            <FiShield size={14} className='text-slate-500' />
            <h2 className='text-sm font-semibold text-slate-900'>On-chain proof history</h2>
          </div>
          {isManager ? (
            <button
              type='button'
              onClick={handleAnchor}
              disabled={isAnchoring || !accessToken}
              className='flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 transition-colors'
            >
              <FiShield size={11} />
              {isAnchoring ? 'Anchoring…' : 'Anchor latest report'}
            </button>
          ) : (
            <span className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500'>
              Verification only
            </span>
          )}
        </div>

        {anchorError && (
          <p className='mx-5 mt-3 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700'>
            {anchorError}
          </p>
        )}
        {anchorsError && (
          <p className='mx-5 mt-3 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700'>
            {anchorsError}
          </p>
        )}

        {isLoadingAnchors ? (
          <div className='h-36 flex items-center justify-center text-sm text-slate-400'>Loading proof history…</div>
        ) : anchors.length === 0 ? (
          <div className='h-24 flex items-center justify-center text-sm text-slate-400'>
            No anchored reports yet — manager can anchor a report above
          </div>
        ) : (
          <div className='h-[260px] overflow-auto divide-y divide-slate-50'>
            {anchors.map((anchor) => (
              <div key={anchor.id} className='px-5 py-4 hover:bg-slate-50 transition-colors'>
                <div className='flex flex-wrap items-center justify-between gap-2 mb-2'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-semibold text-slate-800'>{anchor.period}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[anchor.status]}`}
                    >
                      {STATUS_LABELS[anchor.status]}
                    </span>
                  </div>
                  <p className='text-xs text-slate-400'>{fmtDate(anchor.created_at)}</p>
                </div>

                <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs'>
                  <div className='flex items-center gap-1 font-mono text-slate-500 min-w-0'>
                    <span className='text-slate-400 shrink-0'>report hash</span>
                    <span className='truncate'>{fmtHash(anchor.report_hash)}</span>
                    <CopyButton value={anchor.report_hash} />
                  </div>
                  <div className='flex items-center gap-1 font-mono text-slate-500 min-w-0'>
                    <span className='text-slate-400 shrink-0'>tx hash</span>
                    <span className='truncate'>{fmtHash(anchor.tx_hash)}</span>
                    <CopyButton value={anchor.tx_hash} />
                  </div>
                  <div className='flex items-center gap-1 font-mono text-slate-500'>
                    <span className='text-slate-400 shrink-0'>chain</span>
                    <span>{anchor.chain_id}</span>
                  </div>
                  <div className='flex items-center gap-1 font-mono text-slate-500 min-w-0'>
                    <span className='text-slate-400 shrink-0'>contract</span>
                    <span className='truncate'>{fmtHash(anchor.contract_address, 12)}</span>
                    <CopyButton value={anchor.contract_address} />
                  </div>
                </div>

                {anchor.explorer_url && (
                  <a
                    href={anchor.explorer_url}
                    target='_blank'
                    rel='noreferrer'
                    className='mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2'
                  >
                    <FiExternalLink size={11} />
                    View on explorer
                  </a>
                )}

                {anchor.status === 'failed' && anchor.error_message && (
                  <p className='mt-1.5 text-xs text-rose-600'>{anchor.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Provenance */}
      {overview?.provenance && <ProvenanceBlock prov={overview.provenance} />}
    </AppShell>
  )
}

export default ReportsPage
