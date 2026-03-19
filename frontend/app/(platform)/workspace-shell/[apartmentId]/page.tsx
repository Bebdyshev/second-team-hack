'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { FiCpu } from 'react-icons/fi'
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
import type { ApartmentSimulation } from '@/lib/apartment-sim'

type ApartmentDetailPageProps = {
  params: {
    apartmentId: string
  }
}

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

type ContextZoneProps = {
  label: string
  summary: string
  onAddContext: (item: ContextItem) => void
  children: React.ReactNode
}

const ContextZone = ({ label, summary, onAddContext, children }: ContextZoneProps) => {
  const handlePinContext = () => {
    onAddContext({
      id: `${label}-${summary}`.toLowerCase().replace(/\s+/g, '-'),
      label,
      summary,
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handlePinContext()
  }

  return (
    <div
      role='button'
      tabIndex={0}
      aria-label={`Pin ${label} context for AI assistant`}
      onClick={handlePinContext}
      onKeyDown={handleKeyDown}
      className='cursor-pointer rounded-xl transition-all hover:ring-2 hover:ring-blue-200'
      title='Click to pin this section into AI context'
    >
      {children}
    </div>
  )
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
  const [chatOpen, setChatOpen] = useState(true)
  const [contextItems, setContextItems] = useState<ContextItem[]>([])

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
  const hourlyChartData = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        hour: `${String(index).padStart(2, '0')}:00`,
        electricity: Number((hourlyElectricity[index] ?? 0).toFixed(2)),
        water: Math.round(hourlyWater[index] ?? 0),
        co2: Math.round(hourlyCo2[index] ?? 0),
        humidity: Math.round(hourlyHumidity[index] ?? 0),
      })),
    [hourlyElectricity, hourlyWater, hourlyCo2, hourlyHumidity],
  )
  const monthlyChartData = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        day: index + 1,
        electricity: monthlyElectricity[index] ?? 0,
        water: monthlyWater[index] ?? 0,
      })),
    [monthlyElectricity, monthlyWater],
  )

  const statusClass =
    apartment?.status === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : apartment?.status === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'

  const chatbotApartment = useMemo<ApartmentSimulation | null>(() => {
    if (!apartment) return null

    const match = params.apartmentId.match(/^apt-(\d{3,4})$/)
    const apartmentCode = match?.[1] ?? ''
    const floor = apartmentCode ? Number(apartmentCode.slice(0, apartmentCode.length - 2)) : 0
    const unit = apartmentCode ? Number(apartmentCode.slice(-2)) : 0

    return {
      id: apartment.id,
      floor,
      unit,
      number: apartment.number,
      score: apartment.score,
      status: apartment.status,
      electricityDaily: hourlyElectricity,
      waterDaily: hourlyWater,
      electricityMonthly: monthlyElectricity,
      waterMonthly: monthlyWater,
      co2Series: hourlyCo2.map((item) => Math.round(item)),
      humiditySeries: hourlyHumidity.map((item) => Math.round(item)),
      anomalies: [],
      recommendations: [
        'Shift high-load devices to off-peak hours',
        'Inspect plumbing for night-time leaks',
        'Improve ventilation during evening peak',
      ],
      savings: liveSnapshot?.savings ?? 0,
      points: apartment.score * 12,
    }
  }, [apartment, params.apartmentId, hourlyElectricity, hourlyWater, monthlyElectricity, monthlyWater, hourlyCo2, hourlyHumidity, liveSnapshot?.savings])

  const removeContext = (id: string) => {
    setContextItems((prev) => prev.filter((item) => item.id != id))
  }

  const addContext = (item: ContextItem) => {
    setContextItems((prev) => {
      if (prev.some((existing) => existing.id === item.id)) return prev
      return [item, ...prev].slice(0, 8)
    })
    setChatOpen(true)
  }

  const openChat = () => {
    setChatOpen(true)
  }

  const closeChat = () => {
    setChatOpen(false)
  }

  if (!summary && !isLoading) {
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

  return (
    <AppShell
      title={`Apartment ${apartment?.number ?? params.apartmentId}`}
      subtitle='Detailed analytics and trends'
      rightPanel={
        chatbotApartment ? (
          <ApartmentChatbot
            apartment={chatbotApartment}
            contextItems={contextItems}
            onRemoveContext={removeContext}
            onClose={closeChat}
          />
        ) : undefined
      }
      rightPanelOpen={chatOpen}
    >
      <button
        type='button'
        onClick={openChat}
        className='fixed right-0 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-xl border border-r-0 border-slate-300 bg-white px-2.5 py-4 text-slate-600 shadow-md transition-all duration-300 hover:bg-slate-50 hover:px-3.5'
        style={{ transform: chatOpen ? 'translateX(100%) translateY(-50%)' : 'translateX(0%) translateY(-50%)' }}
        title='Open AI Assistant'
      >
        <FiCpu className='size-4 text-slate-500' />
        <span className='text-[9px] font-semibold tracking-widest text-slate-400' style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          AI
        </span>
      </button>

      <section className='mx-auto w-full max-w-6xl space-y-5'>
        {isLoading && <p className='rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>Loading apartment analytics...</p>}
        <div className='flex items-center justify-between'>
          <Link
            href='/workspace-shell'
            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'
          >
            Back to apartments
          </Link>
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass}`}>
            Eco {apartment?.score ?? 0}
          </span>
        </div>

        <ContextZone
          label='Live snapshot'
          summary={`Electricity ${(liveSnapshot?.electricity ?? 0).toFixed(1)} kWh, water ${Math.round(liveSnapshot?.water ?? 0)} L, CO2 ${Math.round(liveSnapshot?.co2 ?? 0)} ppm, humidity ${Math.round(liveSnapshot?.humidity ?? 0)}%, savings ${liveSnapshot?.savings ?? 0}%`}
          onAddContext={addContext}
        >
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
        </ContextZone>

        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <h2 className='text-sm font-semibold text-slate-900'>Hourly analytics</h2>
          <div className='mt-3 grid gap-4 xl:grid-cols-2'>
            <ContextZone
              label='Hourly electricity and water'
              summary={`Peak electricity ${Math.max(...hourlyElectricity, 0).toFixed(2)} kWh and peak water ${Math.round(Math.max(...hourlyWater, 0))} L in the last 24 hours`}
              onAddContext={addContext}
            >
              <div className='h-64 rounded-lg border border-slate-100 p-2'>
                <ResponsiveContainer width='100%' height='100%'>
                  <LineChart data={hourlyChartData}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#e2e8f0' />
                    <XAxis dataKey='hour' interval={3} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis yAxisId='left' tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis yAxisId='right' orientation='right' tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId='left' type='monotone' dataKey='electricity' name='kWh' stroke='#2563eb' strokeWidth={2} dot={false} />
                    <Line yAxisId='right' type='monotone' dataKey='water' name='Liters' stroke='#0ea5e9' strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ContextZone>
            <ContextZone
              label='Hourly air quality'
              summary={`Peak CO2 ${Math.round(Math.max(...hourlyCo2, 0))} ppm and peak humidity ${Math.round(Math.max(...hourlyHumidity, 0))}% in the last 24 hours`}
              onAddContext={addContext}
            >
              <div className='h-64 rounded-lg border border-slate-100 p-2'>
                <ResponsiveContainer width='100%' height='100%'>
                  <LineChart data={hourlyChartData}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#e2e8f0' />
                    <XAxis dataKey='hour' interval={3} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis yAxisId='left' tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis yAxisId='right' orientation='right' tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId='left' type='monotone' dataKey='co2' name='CO2 ppm' stroke='#f59e0b' strokeWidth={2} dot={false} />
                    <Line yAxisId='right' type='monotone' dataKey='humidity' name='Humidity %' stroke='#16a34a' strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ContextZone>
          </div>
        </article>

        <ContextZone
          label='30-day consumption trend'
          summary={`Monthly max electricity ${Math.max(...monthlyElectricity, 0).toFixed(2)} kWh/day and max water ${Math.round(Math.max(...monthlyWater, 0))} L/day`}
          onAddContext={addContext}
        >
          <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <h2 className='text-sm font-semibold text-slate-900'>30-day consumption</h2>
            <div className='mt-3 h-72 rounded-lg border border-slate-100 p-2'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#e2e8f0' />
                  <XAxis dataKey='day' tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey='electricity' name='Electricity' fill='#2563eb' radius={[6, 6, 0, 0]} />
                  <Bar dataKey='water' name='Water' fill='#0ea5e9' radius={[6, 6, 0, 0]} />
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
