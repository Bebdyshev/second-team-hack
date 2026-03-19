'use client'

import { AppShell } from '@/components/app-shell'
import { integrationStatuses } from '@/lib/boilerplate-data'

const ApiStatusPage = () => {
  const statusTone = {
    healthy: 'bg-emerald-100 text-emerald-700',
    degraded: 'bg-amber-100 text-amber-700',
    down: 'bg-rose-100 text-rose-700',
  } as const

  return (
    <AppShell title='Integrations Health'>
      <p className='text-sm text-slate-500'>Connectivity overview for meter gateways, billing systems and external data sources.</p>
      <section className='mt-5 grid gap-3 md:grid-cols-2'>
        {integrationStatuses.map((integration) => (
          <article key={integration.id} className='rounded-lg border border-slate-200 bg-white p-4'>
            <div className='flex items-center justify-between gap-2'>
              <p className='text-sm font-semibold text-slate-900'>{integration.name}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusTone[integration.status]}`}>{integration.status}</span>
            </div>
            <p className='mt-2 text-xs text-slate-500'>Last ingestion: {integration.lastIngestion}</p>
          </article>
        ))}
      </section>
    </AppShell>
  )
}

export default ApiStatusPage
