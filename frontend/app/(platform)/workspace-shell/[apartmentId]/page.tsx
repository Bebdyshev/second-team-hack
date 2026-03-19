'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

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
    <AppShell title={`Apartment ${apartment?.number ?? params.apartmentId}`} subtitle='Detailed analytics and trends'>
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

        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <h2 className='text-sm font-semibold text-slate-900'>Hourly analytics</h2>
          <div className='mt-3 grid gap-4 xl:grid-cols-2'>
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
          </div>
        </article>

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
      </section>
    </AppShell>
  )
}

export default ApartmentDetailPage
