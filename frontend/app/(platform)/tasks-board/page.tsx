'use client'

import { FiArrowDownRight, FiArrowUpRight } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { houses, resourceKpis } from '@/lib/boilerplate-data'

const TasksBoardPage = () => {
  return (
    <AppShell title='Consumption Board'>
      <p className='text-sm text-slate-500'>Use this board as a baseline for trend cards, per-house comparisons and resource efficiency tracking.</p>
      <section className='mt-5 grid gap-4 lg:grid-cols-2'>
        {houses.map((house) => (
          <article key={house.id} className='rounded-lg border border-slate-200 bg-white p-4'>
            <p className='text-sm font-semibold text-slate-900'>{house.name}</p>
            <p className='text-xs text-slate-500'>Occupancy {house.occupancyRate}%</p>

            <div className='mt-3 grid gap-2 sm:grid-cols-2'>
              {resourceKpis.map((kpi) => {
                const isIncrease = kpi.deltaPercent > 0
                const DeltaIcon = isIncrease ? FiArrowUpRight : FiArrowDownRight

                return (
                  <div key={`${house.id}-${kpi.key}`} className='rounded-md border border-slate-200 p-2'>
                    <p className='text-xs text-slate-500'>{kpi.label}</p>
                    <p className='mt-1 text-sm font-medium text-slate-900'>{Math.round(kpi.currentValue / houses.length)} {kpi.unit}</p>
                    <p className={`mt-1 flex items-center gap-1 text-xs ${isIncrease ? 'text-rose-600' : 'text-emerald-600'}`}>
                      <DeltaIcon className='size-3' />
                      {kpi.deltaPercent > 0 ? '+' : ''}{kpi.deltaPercent.toFixed(1)}%
                    </p>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  )
}

export default TasksBoardPage
