'use client'

import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowDownRight,
  FiArrowUpRight,
  FiDroplet,
  FiHome,
  FiThermometer,
  FiWind,
  FiZap,
} from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { formatPercent, houses, resourceAlerts, resourceKpis } from '@/lib/boilerplate-data'
import type { ResourceKey } from '@/lib/boilerplate-data'

const resourceIcon: Record<ResourceKey, React.ComponentType<{ className?: string }>> = {
  electricity: FiZap,
  water: FiDroplet,
  gas: FiWind,
  heating: FiThermometer,
}

const resourceColor: Record<ResourceKey, { bg: string; text: string; bar: string; icon: string }> = {
  electricity: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', icon: 'bg-amber-100 text-amber-600' },
  water: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-400', icon: 'bg-blue-100 text-blue-600' },
  gas: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', icon: 'bg-orange-100 text-orange-600' },
  heating: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-400', icon: 'bg-rose-100 text-rose-600' },
}

const severityBadge: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-amber-100 text-amber-700',
  medium: 'bg-orange-100 text-orange-700',
  high: 'bg-rose-100 text-rose-700',
}

const DashboardPage = () => {
  const totalUnits = houses.reduce((acc, house) => acc + house.unitsCount, 0)
  const averageOccupancy = Math.round(houses.reduce((acc, house) => acc + house.occupancyRate, 0) / houses.length)
  const highAlerts = resourceAlerts.filter((a) => a.severity === 'high').length

  return (
    <AppShell title='Overview' subtitle='Real-time resource monitoring across all buildings'>
      {/* Top KPI row */}
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>Buildings</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600'>
              <FiHome className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{houses.length}</p>
          <p className='mt-1 text-xs text-slate-400'>{totalUnits} total apartments</p>
        </article>

        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>Active alerts</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600'>
              <FiAlertCircle className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{resourceAlerts.length}</p>
          <p className='mt-1 text-xs text-rose-500'>{highAlerts} critical need action</p>
        </article>

        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>Avg. occupancy</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600'>
              <FiArrowUpRight className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{averageOccupancy}%</p>
          <p className='mt-1 text-xs text-slate-400'>Across all buildings</p>
        </article>

        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>Active meters</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600'>
              <FiZap className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>12</p>
          <p className='mt-1 text-xs text-amber-500'>1 offline</p>
        </article>
      </div>

      {/* Resource KPI cards */}
      <div className='mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {resourceKpis.map((kpi) => {
          const Icon = resourceIcon[kpi.key]
          const color = resourceColor[kpi.key]
          const isOverTarget = kpi.currentValue > kpi.target
          const fillPct = Math.min(100, Math.round((kpi.currentValue / kpi.target) * 100))

          return (
            <article key={kpi.key} className={`rounded-xl p-5 shadow-sm ${color.bg}`}>
              <div className='flex items-center justify-between'>
                <span className={`flex size-9 items-center justify-center rounded-lg ${color.icon}`}>
                  <Icon className='size-4' />
                </span>
                <span className={`flex items-center gap-1 text-xs font-medium ${isOverTarget ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {isOverTarget ? <FiArrowUpRight className='size-3' /> : <FiArrowDownRight className='size-3' />}
                  {formatPercent(kpi.deltaPercent)}
                </span>
              </div>
              <p className={`mt-3 text-2xl font-bold ${color.text}`}>
                {kpi.currentValue.toLocaleString()}
                <span className='ml-1 text-sm font-normal opacity-70'>{kpi.unit}</span>
              </p>
              <p className='mt-0.5 text-sm font-medium text-slate-700'>{kpi.label}</p>
              <div className='mt-3'>
                <div className='flex items-center justify-between text-xs text-slate-500'>
                  <span>Target</span>
                  <span>{fillPct}%</span>
                </div>
                <div className='mt-1 h-1.5 rounded-full bg-white/60'>
                  <div
                    className={`h-full rounded-full ${color.bar} transition-all`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Lower section */}
      <div className='mt-5 grid gap-5 lg:grid-cols-2'>
        {/* Buildings list */}
        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-semibold text-slate-900'>Buildings</h2>
            <span className='text-xs text-slate-400'>{houses.length} total</span>
          </div>
          <div className='space-y-3'>
            {houses.map((house) => (
              <div key={house.id} className='flex items-center gap-3 rounded-lg border border-slate-100 p-3'>
                <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100'>
                  <FiHome className='size-4 text-slate-500' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium text-slate-900'>{house.name}</p>
                  <p className='truncate text-xs text-slate-400'>{house.address}</p>
                </div>
                <div className='text-right'>
                  <p className='text-sm font-semibold text-slate-900'>{house.occupancyRate}%</p>
                  <p className='text-xs text-slate-400'>{house.unitsCount} units</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Recent alerts */}
        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-semibold text-slate-900'>Recent anomalies</h2>
            <span className='text-xs text-slate-400'>{resourceAlerts.length} active</span>
          </div>
          <div className='space-y-3'>
            {resourceAlerts.map((alert) => {
              const Icon = resourceIcon[alert.resource]
              const color = resourceColor[alert.resource]
              return (
                <div key={alert.id} className='flex items-start gap-3 rounded-lg border border-slate-100 p-3'>
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${color.icon}`}>
                    <Icon className='size-3.5' />
                  </span>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <p className='truncate text-sm font-medium text-slate-900'>{alert.title}</p>
                    </div>
                    <p className='mt-0.5 text-xs text-slate-400'>{alert.houseName} · {alert.detectedAt}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge[alert.severity]}`}>
                    {alert.severity}
                  </span>
                </div>
              )
            })}
          </div>
          <div className='mt-4 flex items-center gap-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500'>
            <FiAlertTriangle className='size-3.5 text-amber-500' />
            {highAlerts} alert{highAlerts !== 1 ? 's' : ''} need immediate attention
          </div>
        </article>
      </div>
    </AppShell>
  )
}

export default DashboardPage
