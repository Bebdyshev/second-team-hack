'use client'

import Link from 'next/link'
<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiCpu } from 'react-icons/fi'
=======
import { useEffect, useMemo, useState } from 'react'
>>>>>>> b17ba8f (feat: enhance dashboard and apartment detail pages with new data fetching and state management)
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ApartmentChatbot, type ContextItem } from '@/components/apartment-chatbot'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

type ApartmentDetailPageProps = {
  params: { apartmentId: string }
}

<<<<<<< HEAD
// ── Context zone wrapper ──────────────────────────────────────────────────────
const ContextZone = ({
  label,
  summary,
  onAdd,
  onOpenChat,
  added,
  children,
}: {
  label: string
  summary: string
  onAdd: (label: string, summary: string) => void
  onOpenChat: () => void
  added: boolean
  children: React.ReactNode
}) => {
  const handleClick = () => {
    onOpenChat()
    if (!added) onAdd(label, summary)
  }

  return (
    <div
      className='group relative self-start overflow-hidden rounded-xl'
      onClick={handleClick}
      title={added ? 'Already in AI context' : `Click to reference "${label}" in AI`}
    >
      {/* border: transparent → blue on hover; stays green when added */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 rounded-[inherit] ring-2 ring-inset transition-all duration-150 ${
          added
            ? 'ring-emerald-400'
            : 'ring-transparent group-hover:ring-blue-400'
        }`}
      />

      {/* badge: only shows on hover (or stays when added) */}
      <div
        className={`absolute right-3 top-3 z-20 transition-opacity duration-150 ${
          added ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${
            added ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'
          }`}
        >
          {added ? '✓ In AI context' : '+ Add to AI'}
        </span>
      </div>

      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
const ApartmentDetailPage = ({ params }: ApartmentDetailPageProps) => {
  const apartment = useMemo(() => getApartmentById(params.apartmentId), [params.apartmentId])

  const [contextItems, setContextItems] = useState<ContextItem[]>([])
  const [chatOpen, setChatOpen] = useState(true)

  // Always open when apartment page loads so users see the assistant
  useEffect(() => {
    setChatOpen(true)
    localStorage.setItem('apt-chat-open', 'true')
  }, [])

  // Auto-open sidebar whenever a new context item is pinned
  useEffect(() => {
    if (contextItems.length > 0) {
      setChatOpen(true)
      localStorage.setItem('apt-chat-open', 'true')
    }
  }, [contextItems.length])

  const openChat = () => {
    setChatOpen(true)
    localStorage.setItem('apt-chat-open', 'true')
  }

  const closeChat = () => {
    setChatOpen(false)
    localStorage.setItem('apt-chat-open', 'false')
  }

  const addContext = useCallback((label: string, summary: string) => {
    setContextItems((prev) => {
      if (prev.some((c) => c.label === label)) return prev
      return [...prev, { id: `${label}-${Date.now()}`, label, summary }]
    })
    // auto-open the sidebar whenever something is pinned
    setChatOpen(true)
    localStorage.setItem('apt-chat-open', 'true')
  }, [])

  const removeContext = useCallback((id: string) => {
    setContextItems((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const addedLabels = useMemo(() => new Set(contextItems.map((c) => c.label)), [contextItems])

  if (!apartment) {
=======
type ApartmentSummaryResponse = {
  apartment: {
    id: string
    number: string
    score: number
    status: 'good' | 'watch' | 'alert'
  }
  live_snapshot: {
    electricity: number
    water: number
    co2: number
    humidity: number
    savings: number
  }
}

type DynamicsResponse = {
  dynamics: Array<{ label: string; value: number }>
}

const ApartmentDetailPage = ({ params }: ApartmentDetailPageProps) => {
  const { accessToken } = useAuth()
  const [summary, setSummary] = useState<ApartmentSummaryResponse | null>(null)
  const [hourlyElectricity, setHourlyElectricity] = useState<number[]>([])
  const [hourlyWater, setHourlyWater] = useState<number[]>([])
  const [hourlyCo2, setHourlyCo2] = useState<number[]>([])
  const [hourlyHumidity, setHourlyHumidity] = useState<number[]>([])
  const [monthlyElectricity, setMonthlyElectricity] = useState<number[]>([])
  const [monthlyWater, setMonthlyWater] = useState<number[]>([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadApartment = async () => {
      if (!accessToken) return
      setIsLoading(true)
      setError('')
      try {
        const [summaryResponse, electricity24h, water24h, co224h, humidity24h, electricity30d, water30d] = await Promise.all([
          apiRequest<ApartmentSummaryResponse>(`/apartments/${params.apartmentId}/summary`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/apartments/${params.apartmentId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/apartments/${params.apartmentId}/dynamics?resource=water&period=24h`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/apartments/${params.apartmentId}/dynamics?resource=co2&period=24h`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/apartments/${params.apartmentId}/dynamics?resource=humidity&period=24h`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/apartments/${params.apartmentId}/dynamics?resource=electricity&period=30d`, { token: accessToken }),
          apiRequest<DynamicsResponse>(`/apartments/${params.apartmentId}/dynamics?resource=water&period=30d`, { token: accessToken }),
        ])
        setSummary(summaryResponse)
        setHourlyElectricity(electricity24h.dynamics.map((item) => item.value))
        setHourlyWater(water24h.dynamics.map((item) => item.value))
        setHourlyCo2(co224h.dynamics.map((item) => item.value))
        setHourlyHumidity(humidity24h.dynamics.map((item) => item.value))
        setMonthlyElectricity(electricity30d.dynamics.map((item) => item.value))
        setMonthlyWater(water30d.dynamics.map((item) => item.value))
      } catch (requestError) {
        const message = requestError instanceof ApiError ? requestError.message : 'Failed to load apartment analytics'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }
    void loadApartment()
  }, [accessToken, params.apartmentId])

  const apartment = summary?.apartment
  const liveSnapshot = summary?.live_snapshot
  const hourlyChartData = useMemo(() => Array.from({ length: 24 }, (_, index) => ({
    hour: `${String(index).padStart(2, '0')}:00`,
    electricity: Number((hourlyElectricity[index] ?? 0).toFixed(2)),
    water: Math.round(hourlyWater[index] ?? 0),
    co2: Math.round(hourlyCo2[index] ?? 0),
    humidity: Math.round(hourlyHumidity[index] ?? 0),
  })), [hourlyElectricity, hourlyWater, hourlyCo2, hourlyHumidity])
  const monthlyChartData = useMemo(() => Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    electricity: monthlyElectricity[index] ?? 0,
    water: monthlyWater[index] ?? 0,
  }))
  , [monthlyElectricity, monthlyWater])

  const statusClass =
    apartment?.status === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : apartment?.status === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'

  if (!summary && !isLoading) {
>>>>>>> b17ba8f (feat: enhance dashboard and apartment detail pages with new data fetching and state management)
    return (
      <AppShell title='Apartment not found' subtitle='Invalid apartment id'>
        <section className='mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm'>
          <p className='text-sm text-slate-600'>{error || 'Cannot open apartment analytics for this id.'}</p>
          <Link
            href='/workspace-shell'
            className='mt-4 inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'
          >
            Back to apartments
          </Link>
        </section>
      </AppShell>
    )
  }

<<<<<<< HEAD
  const liveHour = new Date().getHours() % 24

  const hourlyChartData = HOURS.map((hour, index) => ({
    hour: hour.slice(0, 5),
    electricity: Number(apartment.electricityDaily[index].toFixed(2)),
    water: Math.round(apartment.waterDaily[index]),
    co2: apartment.co2Series[index],
    humidity: apartment.humiditySeries[index],
  }))

  const monthlyChartData = apartment.electricityMonthly.map((electricity, index) => ({
    day: index + 1,
    electricity,
    water: apartment.waterMonthly[index],
  }))

  // Context summaries ──────────────────────────────────────────────────────────
  const snapshotSummary = [
    `Live at ${HOURS[liveHour]}:`,
    `- Electricity: ${apartment.electricityDaily[liveHour].toFixed(2)} kWh`,
    `- Water: ${Math.round(apartment.waterDaily[liveHour])} L`,
    `- CO2: ${apartment.co2Series[liveHour]} ppm | Humidity: ${apartment.humiditySeries[liveHour]}%`,
    `- Eco Score: ${apartment.score}/100 (${apartment.status}) | Savings: ${apartment.savings}%`,
  ].join('\n')

  const maxElecHour = apartment.electricityDaily.indexOf(Math.max(...apartment.electricityDaily))
  const maxWaterHour = apartment.waterDaily.indexOf(Math.max(...apartment.waterDaily))
  const elecWaterSummary = [
    `Electricity & water 24h:`,
    `- Peak electricity: ${apartment.electricityDaily[maxElecHour].toFixed(2)} kWh at ${HOURS[maxElecHour]}`,
    `- Peak water: ${Math.round(apartment.waterDaily[maxWaterHour])} L at ${HOURS[maxWaterHour]}`,
    `- Avg electricity: ${(apartment.electricityDaily.reduce((s, v) => s + v, 0) / 24).toFixed(2)} kWh`,
    `Hourly electricity: ${HOURS.map((h, i) => `${h}=${apartment.electricityDaily[i].toFixed(1)}`).join(', ')}`,
    `Hourly water: ${HOURS.map((h, i) => `${h}=${Math.round(apartment.waterDaily[i])}`).join(', ')}`,
  ].join('\n')

  const maxCo2Hour = apartment.co2Series.indexOf(Math.max(...apartment.co2Series))
  const airSummary = [
    `CO2 & humidity 24h:`,
    `- Peak CO2: ${apartment.co2Series[maxCo2Hour]} ppm at ${HOURS[maxCo2Hour]}`,
    `- Avg CO2: ${Math.round(apartment.co2Series.reduce((s, v) => s + v, 0) / 24)} ppm`,
    `- Avg humidity: ${Math.round(apartment.humiditySeries.reduce((s, v) => s + v, 0) / 24)}%`,
    `Hourly CO2: ${HOURS.map((h, i) => `${h}=${apartment.co2Series[i]}`).join(', ')}`,
    `Hourly humidity: ${HOURS.map((h, i) => `${h}=${apartment.humiditySeries[i]}`).join(', ')}`,
  ].join('\n')

  const monthlyElecTotal = apartment.electricityMonthly.reduce((s, v) => s + v, 0)
  const monthlyWaterTotal = apartment.waterMonthly.reduce((s, v) => s + v, 0)
  const monthlySummary = [
    `30-day consumption:`,
    `- Total electricity: ${monthlyElecTotal} kWh (avg ${Math.round(monthlyElecTotal / 30)} kWh/day)`,
    `- Total water: ${monthlyWaterTotal} L (avg ${Math.round(monthlyWaterTotal / 30)} L/day)`,
    `Daily electricity: ${apartment.electricityMonthly.map((v, i) => `Day${i + 1}=${v}`).join(', ')}`,
    `Daily water: ${apartment.waterMonthly.map((v, i) => `Day${i + 1}=${v}`).join(', ')}`,
  ].join('\n')

  const anomaliesSummary = [
    `Anomalies (${apartment.anomalies.length}):`,
    ...(apartment.anomalies.length > 0 ? apartment.anomalies.map((a) => `- ${a}`) : ['- None']),
  ].join('\n')

  const recsSummary = [
    `AI Recommendations:`,
    ...apartment.recommendations.map((r) => `- ${r}`),
  ].join('\n')

  // ─────────────────────────────────────────────────────────────────────────────
  const statusClass =
    apartment.status === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : apartment.status === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'

  const chatPanel = (
    <ApartmentChatbot
      apartment={apartment}
      contextItems={contextItems}
      onRemoveContext={removeContext}
      onClose={closeChat}
    />
  )

  return (
    <AppShell
      title={`Apartment ${apartment.number}`}
      subtitle='Click any section below to pin it to the AI assistant'
      rightPanel={chatPanel}
      rightPanelOpen={chatOpen}
    >
      {/* Right-edge AI tab – visible when panel is closed, slides off when open */}
      <button
        onClick={openChat}
        className='fixed right-0 top-1/2 z-50 flex flex-col items-center gap-2 rounded-l-xl border border-r-0 border-slate-300 bg-white px-2.5 py-4 text-slate-600 shadow-md transition-all duration-300 hover:bg-slate-50 hover:px-3.5'
        style={{
          transform: chatOpen
            ? 'translateX(100%) translateY(-50%)'
            : 'translateX(0%) translateY(-50%)',
          transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), padding 0.15s ease',
        }}
        title='Open AI Assistant'
      >
        <FiCpu className='size-4 text-slate-500' />
        <span className='text-[9px] font-semibold tracking-widest text-slate-400' style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          AI
        </span>
        {contextItems.length > 0 && (
          <span className='flex size-4 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-white'>
            {contextItems.length}
          </span>
        )}
      </button>

      <section className='mx-auto w-full max-w-4xl space-y-4 pb-20'>
        {/* Back + status */}
=======
  return (
    <AppShell
      title={`Apartment ${apartment?.number ?? params.apartmentId}`}
      subtitle='Detailed analytics and trends'
    >
      <section className='mx-auto w-full max-w-6xl space-y-5'>
        {isLoading && <p className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>Loading apartment analytics...</p>}
>>>>>>> b17ba8f (feat: enhance dashboard and apartment detail pages with new data fetching and state management)
        <div className='flex items-center justify-between'>
          <Link
            href='/workspace-shell'
            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'
          >
            ← Back to apartments
          </Link>
<<<<<<< HEAD
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}>
            Eco Score {apartment.score}
          </span>
        </div>

        {/* Live snapshot */}
        <ContextZone label='Live snapshot' summary={snapshotSummary} onAdd={addContext} onOpenChat={openChat} added={addedLabels.has('Live snapshot')}>
          <article className='rounded-xl border border-slate-200 bg-white p-4 pb-10 shadow-sm'>
            <h2 className='text-sm font-semibold text-slate-900'>Live snapshot</h2>
            <div className='mt-3 grid gap-3 sm:grid-cols-4'>
              <div className='rounded-lg bg-slate-50 p-3'>
                <p className='text-xs text-slate-500'>Electricity</p>
                <p className='text-sm font-semibold text-slate-900'>{apartment.electricityDaily[liveHour].toFixed(1)} kWh</p>
              </div>
              <div className='rounded-lg bg-slate-50 p-3'>
                <p className='text-xs text-slate-500'>Water</p>
                <p className='text-sm font-semibold text-slate-900'>{Math.round(apartment.waterDaily[liveHour])} L</p>
              </div>
              <div className='rounded-lg bg-slate-50 p-3'>
                <p className='text-xs text-slate-500'>Air quality</p>
                <p className='text-sm font-semibold text-slate-900'>{apartment.co2Series[liveHour]} ppm / {apartment.humiditySeries[liveHour]}%</p>
              </div>
              <div className='rounded-lg bg-slate-50 p-3'>
                <p className='text-xs text-slate-500'>Projected savings</p>
                <p className='text-sm font-semibold text-emerald-700'>{apartment.savings}%</p>
              </div>
            </div>
          </article>
        </ContextZone>
=======
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass}`}>
            Eco {apartment?.score ?? 0}
          </span>
        </div>

        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <h2 className='text-sm font-semibold text-slate-900'>Live snapshot</h2>
          <div className='mt-3 grid gap-3 sm:grid-cols-4'>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Electricity</p>
              <p className='text-sm font-semibold text-slate-900'>{(liveSnapshot?.electricity ?? 0).toFixed(1)} kWh</p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Water</p>
              <p className='text-sm font-semibold text-slate-900'>{Math.round(liveSnapshot?.water ?? 0)} L</p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Air</p>
              <p className='text-sm font-semibold text-slate-900'>
                {Math.round(liveSnapshot?.co2 ?? 0)} ppm / {Math.round(liveSnapshot?.humidity ?? 0)}%
              </p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Projected savings</p>
              <p className='text-sm font-semibold text-emerald-700'>{liveSnapshot?.savings ?? 0}%</p>
            </div>
          </div>
        </article>
>>>>>>> b17ba8f (feat: enhance dashboard and apartment detail pages with new data fetching and state management)

        {/* Anomalies + recommendations */}
        {(apartment.anomalies.length > 0 || apartment.recommendations.length > 0) && (
          <div className='grid gap-4 md:grid-cols-2'>
            <ContextZone label='Anomalies' summary={anomaliesSummary} onAdd={addContext} onOpenChat={openChat} added={addedLabels.has('Anomalies')}>
              <article className='rounded-xl border border-slate-200 bg-white p-4 pb-10 shadow-sm'>
                <h2 className='text-sm font-semibold text-slate-900'>
                  Anomalies
                  {apartment.anomalies.length > 0 && (
                    <span className='ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700'>
                      {apartment.anomalies.length}
                    </span>
                  )}
                </h2>
                <div className='mt-3 space-y-2'>
                  {apartment.anomalies.length === 0 ? (
                    <p className='text-xs text-emerald-600'>No anomalies ✓</p>
                  ) : (
                    apartment.anomalies.map((a, i) => (
                      <p key={i} className='rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700'>{a}</p>
                    ))
                  )}
                </div>
              </article>
            </ContextZone>

            <ContextZone label='AI Recommendations' summary={recsSummary} onAdd={addContext} onOpenChat={openChat} added={addedLabels.has('AI Recommendations')}>
              <article className='rounded-xl border border-slate-200 bg-white p-4 pb-10 shadow-sm'>
                <h2 className='text-sm font-semibold text-slate-900'>AI Recommendations</h2>
                <div className='mt-3 space-y-2'>
                  {apartment.recommendations.map((r, i) => (
                    <p key={i} className='rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700'>{r}</p>
                  ))}
                </div>
              </article>
            </ContextZone>
          </div>
        )}

        {/* Hourly electricity & water */}
        <ContextZone label='Hourly electricity & water' summary={elecWaterSummary} onAdd={addContext} onOpenChat={openChat} added={addedLabels.has('Hourly electricity & water')}>
          <article className='rounded-xl border border-slate-200 bg-white p-4 pb-10 shadow-sm'>
            <h2 className='text-sm font-semibold text-slate-900'>Hourly analytics – electricity & water</h2>
            <div className='mt-3 h-64 rounded-lg border border-slate-100 p-2'>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#e2e8f0' />
                  <XAxis dataKey='hour' interval={3} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId='left' tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId='right' orientation='right' tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId='left' type='monotone' dataKey='electricity' name='kWh' stroke='#2563eb' strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId='right' type='monotone' dataKey='water' name='Liters' stroke='#0ea5e9' strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        </ContextZone>

        {/* Hourly CO2 & humidity */}
        <ContextZone label='Hourly CO2 & humidity' summary={airSummary} onAdd={addContext} onOpenChat={openChat} added={addedLabels.has('Hourly CO2 & humidity')}>
          <article className='rounded-xl border border-slate-200 bg-white p-4 pb-10 shadow-sm'>
            <h2 className='text-sm font-semibold text-slate-900'>Hourly analytics – air quality</h2>
            <div className='mt-3 h-64 rounded-lg border border-slate-100 p-2'>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#e2e8f0' />
                  <XAxis dataKey='hour' interval={3} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId='left' tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis yAxisId='right' orientation='right' tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId='left' type='monotone' dataKey='co2' name='CO2 ppm' stroke='#f59e0b' strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId='right' type='monotone' dataKey='humidity' name='Humidity %' stroke='#16a34a' strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        </ContextZone>

        {/* 30-day consumption */}
        <ContextZone label='30-day consumption' summary={monthlySummary} onAdd={addContext} onOpenChat={openChat} added={addedLabels.has('30-day consumption')}>
          <article className='rounded-xl border border-slate-200 bg-white p-4 pb-10 shadow-sm'>
            <h2 className='text-sm font-semibold text-slate-900'>30-day consumption</h2>
            <div className='mt-3 h-72 rounded-lg border border-slate-100 p-2'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#e2e8f0' />
                  <XAxis dataKey='day' tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey='electricity' name='Electricity' fill='#2563eb' radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey='water' name='Water' fill='#0ea5e9' radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </ContextZone>
      </section>
    </AppShell>
  )
}

export default ApartmentDetailPage
