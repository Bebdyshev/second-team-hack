import { AppShell } from '@/components/app-shell'
import { houses } from '@/lib/boilerplate-data'

const WorkspaceShellPage = () => {
  return (
    <AppShell title='Houses Registry'>
      <p className='text-sm text-slate-500'>Central list of monitored residential houses, occupancy and responsible managers.</p>

      <section className='mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {houses.map((house) => (
          <article key={house.id} className='rounded-lg border border-slate-200 bg-white p-4'>
            <p className='text-sm font-semibold text-slate-900'>{house.name}</p>
            <p className='mt-1 text-xs text-slate-500'>{house.address}</p>
            <div className='mt-4 space-y-1 text-sm text-slate-700'>
              <p>Units: {house.unitsCount}</p>
              <p>Occupancy: {house.occupancyRate}%</p>
              <p>Manager: {house.manager}</p>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  )
}

export default WorkspaceShellPage
