import { AppShell } from '@/components/app-shell'
import { maintenanceTasks } from '@/lib/boilerplate-data'

const AgentsPage = () => {
  const statusTone = {
    planned: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-blue-100 text-blue-700',
    blocked: 'bg-rose-100 text-rose-700',
    done: 'bg-emerald-100 text-emerald-700',
  } as const

  return (
    <AppShell title='Maintenance Queue'>
      <p className='text-sm text-slate-500'>Operational backlog for field teams and maintenance automations.</p>
      <section className='mt-5 space-y-3'>
        {maintenanceTasks.map((task) => (
          <article key={task.id} className='rounded-lg border border-slate-200 bg-white p-4'>
            <div className='flex items-center justify-between gap-3'>
              <p className='text-sm font-semibold text-slate-900'>{task.scope}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusTone[task.status]}`}>{task.status}</span>
            </div>
            <p className='mt-1 text-xs text-slate-500'>House: {task.houseName}</p>
            <p className='mt-1 text-xs text-slate-500'>Due: {task.dueDate}</p>
          </article>
        ))}
      </section>
    </AppShell>
  )
}

export default AgentsPage
