'use client'

import { FiAlertCircle, FiArrowDownRight, FiArrowUpRight, FiHome } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { formatPercent, houses, resourceAlerts, resourceKpis } from '@/lib/boilerplate-data'

const DashboardPage = () => {
  const totalUnits = houses.reduce((acc, house) => acc + house.unitsCount, 0)
  const averageOccupancy = Math.round(houses.reduce((acc, house) => acc + house.occupancyRate, 0) / houses.length)

  return (
    <AppShell title='Portfolio Overview'>
      <p className='text-sm text-slate-500'>Starter dashboard for monitoring electricity, water, gas and heating consumption across residential houses.</p>

      <section className='mt-5 grid gap-3 md:grid-cols-3'>
        <article className='rounded-lg border border-slate-200 bg-white p-4'>
          <div className='flex items-center gap-2 text-slate-500'>
            <FiHome className='size-4' />
            <p className='text-sm'>Houses</p>
          </div>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{houses.length}</p>
          <p className='text-xs text-slate-500'>{totalUnits} total units</p>
        </article>

        <article className='rounded-lg border border-slate-200 bg-white p-4'>
          <div className='flex items-center gap-2 text-slate-500'>
            <FiAlertCircle className='size-4' />
            <p className='text-sm'>Active alerts</p>
          </div>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{resourceAlerts.length}</p>
          <p className='text-xs text-slate-500'>2 need immediate action</p>
        </article>

        <article className='rounded-lg border border-slate-200 bg-white p-4'>
          <div className='flex items-center gap-2 text-slate-500'>
            <FiArrowUpRight className='size-4' />
            <p className='text-sm'>Average occupancy</p>
          </div>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{averageOccupancy}%</p>
          <p className='text-xs text-slate-500'>Across all connected houses</p>
        </article>
      </section>

      <section className='mt-6 grid gap-4 lg:grid-cols-2'>
        <article className='rounded-lg border border-slate-200 bg-white p-4'>
          <h2 className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Resource KPIs</h2>
          <div className='mt-3 space-y-2'>
            {resourceKpis.map((kpi) => {
              const isPositive = kpi.deltaPercent >= 0
              const DeltaIcon = isPositive ? FiArrowUpRight : FiArrowDownRight

              return (
                <div key={kpi.key} className='rounded-md border border-slate-200 px-3 py-2'>
                  <div className='flex items-center justify-between text-sm text-slate-800'>
                    <span>{kpi.label}</span>
                    <span className='font-medium'>{kpi.currentValue} {kpi.unit}</span>
                  </div>
                  <div className='mt-1 flex items-center justify-between text-xs'>
                    <span className='text-slate-500'>Target: {kpi.target} {kpi.unit}</span>
                    <span className={`flex items-center gap-1 ${isPositive ? 'text-rose-600' : 'text-emerald-600'}`}>
                      <DeltaIcon className='size-3' />
                      {formatPercent(kpi.deltaPercent)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </article>

        <article className='rounded-lg border border-slate-200 bg-white p-4'>
          <h2 className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Recent anomalies</h2>
          <div className='mt-3 space-y-2'>
            {resourceAlerts.map((alert) => (
              <div key={alert.id} className='rounded-md border border-slate-200 px-3 py-2'>
                <p className='text-sm font-medium text-slate-900'>{alert.title}</p>
                <p className='mt-1 text-xs text-slate-500'>
                  {alert.houseName} - {alert.resource} - {alert.detectedAt}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </AppShell>
  )
}

export default DashboardPage
