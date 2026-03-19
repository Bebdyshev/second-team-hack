import { AppShell } from '@/components/app-shell'
import { meterHealth } from '@/lib/boilerplate-data'

const DataTablesPage = () => {
  const signalTone = {
    good: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    weak: 'bg-amber-100 text-amber-700 border-amber-200',
    offline: 'bg-rose-100 text-rose-700 border-rose-200',
  } as const

  return (
    <AppShell title='Meter Fleet'>
      <p className='text-sm text-slate-500'>Starter table for smart meter connectivity, last sync timestamp and telemetry data quality checks.</p>
      <div className='mt-5 overflow-hidden rounded-lg border border-slate-200'>
        <table className='w-full border-collapse text-left text-sm'>
          <thead className='bg-slate-50 text-xs uppercase tracking-wide text-slate-500'>
            <tr>
              <th className='px-4 py-3'>Meter</th>
              <th className='px-4 py-3'>House</th>
              <th className='px-4 py-3'>Resource</th>
              <th className='px-4 py-3'>Signal</th>
              <th className='px-4 py-3'>Last Sync</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100 bg-white'>
            {meterHealth.map((meter) => (
              <tr key={meter.id}>
                <td className='px-4 py-3 font-medium text-slate-900'>{meter.id}</td>
                <td className='px-4 py-3 text-slate-700'>{meter.houseName}</td>
                <td className='px-4 py-3 text-slate-700'>{meter.resource}</td>
                <td className='px-4 py-3'>
                  <span className={`rounded-full border px-2 py-1 text-xs ${signalTone[meter.signalStrength]}`}>{meter.signalStrength}</span>
                </td>
                <td className='px-4 py-3 text-slate-500'>{meter.lastSync}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}

export default DataTablesPage
