import { AppShell } from '@/components/app-shell'
import { monthlyReports } from '@/lib/boilerplate-data'

const LegalAssistantPage = () => {
  const totalAnomalies = monthlyReports.reduce((acc, report) => acc + report.anomalyCount, 0)

  return (
    <AppShell title='Monthly Reports'>
      <p className='text-sm text-slate-500'>Boilerplate reporting layer for monthly consumption, anomaly volume and trend review.</p>

      <div className='mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700'>
        Total anomalies in selected period: <span className='font-semibold text-slate-900'>{totalAnomalies}</span>
      </div>

      <section className='mt-4 grid gap-3 md:grid-cols-3'>
        {monthlyReports.map((report) => (
          <article key={report.id} className='rounded-lg border border-slate-200 bg-white p-4'>
            <p className='text-sm font-semibold text-slate-900'>{report.period}</p>
            <p className='mt-2 text-sm text-slate-700'>Consumption: {report.totalConsumption} {report.unit}</p>
            <p className='mt-1 text-xs text-slate-500'>Anomalies: {report.anomalyCount}</p>
          </article>
        ))}
      </section>
    </AppShell>
  )
}

export default LegalAssistantPage
