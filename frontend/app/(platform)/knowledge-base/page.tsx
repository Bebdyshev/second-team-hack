import { AppShell } from '@/components/app-shell'
import { resourceAlerts } from '@/lib/boilerplate-data'

const KnowledgeBasePage = () => {
  const severityTone = {
    low: 'bg-amber-50 border-amber-200 text-amber-700',
    medium: 'bg-orange-50 border-orange-200 text-orange-700',
    high: 'bg-rose-50 border-rose-200 text-rose-700',
  } as const

  return (
    <AppShell title='Alerts Center'>
      <p className='text-sm text-slate-500'>Boilerplate incident feed with severity, source house and timestamp fields.</p>
      <section className='mt-5 space-y-3'>
        {resourceAlerts.map((alert) => (
          <article key={alert.id} className={`rounded-lg border p-4 ${severityTone[alert.severity]}`}>
            <p className='text-sm font-semibold'>{alert.title}</p>
            <p className='mt-1 text-xs'>
              House: {alert.houseName} | Resource: {alert.resource} | Detected: {alert.detectedAt}
            </p>
          </article>
        ))}
      </section>
    </AppShell>
  )
}

export default KnowledgeBasePage
