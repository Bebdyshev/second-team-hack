'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'
import { monthlyReports } from '@/lib/boilerplate-data'

type ReportAnchor = {
  id: string
  period: string
  report_hash: string
  status: 'pending' | 'confirmed' | 'failed'
  tx_hash: string
  explorer_url: string
  created_at: string
  error_message: string
}

const LegalAssistantPage = () => {
  const { accessToken, activeOrganizationId } = useAuth()
  const totalAnomalies = monthlyReports.reduce((acc, report) => acc + report.anomalyCount, 0)
  const [anchors, setAnchors] = useState<ReportAnchor[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isAnchoring, setIsAnchoring] = useState(false)

  const activeHouseId = activeOrganizationId ?? 'house-1'

  const latestPeriod = useMemo(() => monthlyReports[monthlyReports.length - 1]?.period ?? new Date().toISOString().slice(0, 7), [])

  const loadAnchors = useCallback(async () => {
    if (!accessToken) return
    setIsLoading(true)
    setError('')
    try {
      const response = await apiRequest<ReportAnchor[]>(`/houses/${activeHouseId}/reports/anchors`, {
        token: accessToken,
      })
      setAnchors(response)
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Failed to load report proofs'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, activeHouseId])

  const handleAnchorLatestReport = async () => {
    if (!accessToken) return
    setIsAnchoring(true)
    setError('')
    try {
      await apiRequest<ReportAnchor>(`/houses/${activeHouseId}/reports/anchor`, {
        method: 'POST',
        token: accessToken,
        body: { period: latestPeriod, metadata_uri: `report://${activeHouseId}/${latestPeriod}` },
      })
      await loadAnchors()
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Failed to anchor report'
      setError(message)
    } finally {
      setIsAnchoring(false)
    }
  }

  useEffect(() => {
    void loadAnchors()
  }, [loadAnchors])

  return (
    <AppShell title='Monthly Reports'>
      <p className='text-sm text-slate-500'>Boilerplate reporting layer for monthly consumption, anomaly volume and trend review.</p>

      <div className='mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700'>
        Total anomalies in selected period: <span className='font-semibold text-slate-900'>{totalAnomalies}</span>
      </div>

      <section className='mt-4 grid gap-3 md:grid-cols-3'>
        {monthlyReports.map((report) => (
          <article key={report.id} className='rounded-lg border border-slate-200 bg-white p-4'>
            <p className='text-sm font-semibold text-slate-900'>{report.period}</p>
            <p className='mt-2 text-sm text-slate-700'>Consumption: {report.totalConsumption} {report.unit}</p>
            <p className='mt-1 text-xs text-slate-500'>Anomalies: {report.anomalyCount}</p>
          </article>
        ))}
      </section>

      <section className='mt-5 rounded-lg border border-slate-200 bg-white p-4'>
        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-sm font-semibold text-slate-900'>On-chain proof</h2>
          <button
            type='button'
            onClick={handleAnchorLatestReport}
            disabled={isAnchoring || !accessToken}
            className='rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60'
          >
            {isAnchoring ? 'Anchoring...' : 'Anchor latest report'}
          </button>
        </div>

        {error && <p className='mb-2 text-xs text-rose-600'>{error}</p>}
        {isLoading ? (
          <p className='text-xs text-slate-500'>Loading proof history...</p>
        ) : anchors.length == 0 ? (
          <p className='text-xs text-slate-500'>No anchored reports yet</p>
        ) : (
          <div className='space-y-2'>
            {anchors.map((anchor) => (
              <article key={anchor.id} className='rounded-md border border-slate-200 p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs font-medium text-slate-800'>{anchor.period}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      anchor.status == 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : anchor.status == 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {anchor.status == 'confirmed' ? 'Verified on-chain' : anchor.status}
                  </span>
                </div>
                <p className='mt-1 text-[11px] text-slate-500'>hash: {anchor.report_hash.slice(0, 12)}...</p>
                {anchor.explorer_url && (
                  <a href={anchor.explorer_url} target='_blank' rel='noreferrer' className='mt-1 inline-block text-[11px] text-blue-600 underline'>
                    Open tx
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}

export default LegalAssistantPage
