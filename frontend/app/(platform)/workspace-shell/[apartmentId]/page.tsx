'use client'

import Link from 'next/link'
import { useMemo } from 'react'
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
import { HOURS, getApartmentById } from '@/lib/apartment-sim'

type ApartmentDetailPageProps = {
  params: {
    apartmentId: string
  }
}

const ApartmentDetailPage = ({ params }: ApartmentDetailPageProps) => {
  const apartment = useMemo(() => getApartmentById(params.apartmentId), [params.apartmentId])

  if (!apartment) {
    return (
      <AppShell title='Apartment not found' subtitle='Invalid apartment id'>
        <section className='mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm'>
          <p className='text-sm text-slate-600'>Cannot open apartment analytics for this id.</p>
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

  const statusClass =
    apartment.status === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : apartment.status === 'watch'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'

  return (
    <AppShell
      title={`Apartment ${apartment.number}`}
      subtitle='Detailed analytics and trends'
    >
      <section className='mx-auto w-full max-w-6xl space-y-5'>
        <div className='flex items-center justify-between'>
          <Link
            href='/workspace-shell'
            className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'
          >
            Back to apartments
          </Link>
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass}`}>
            Eco {apartment.score}
          </span>
        </div>

        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
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
              <p className='text-xs text-slate-500'>Air</p>
              <p className='text-sm font-semibold text-slate-900'>
                {apartment.co2Series[liveHour]} ppm / {apartment.humiditySeries[liveHour]}%
              </p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Projected savings</p>
              <p className='text-sm font-semibold text-emerald-700'>{apartment.savings}%</p>
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
