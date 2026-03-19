'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FiAlertTriangle, FiBarChart2, FiDatabase, FiFileText, FiHome, FiLayers, FiTool, FiWifi } from 'react-icons/fi'

const mainLinks = [
  { href: '/dashboard', label: 'Overview', icon: FiHome },
  { href: '/workspace-shell', label: 'Houses', icon: FiLayers },
  { href: '/tasks-board', label: 'Consumption', icon: FiBarChart2 },
  { href: '/data-tables', label: 'Meters', icon: FiDatabase },
  { href: '/knowledge-base', label: 'Alerts', icon: FiAlertTriangle },
  { href: '/agents', label: 'Maintenance', icon: FiTool },
  { href: '/legal-assistant', label: 'Reports', icon: FiFileText },
  { href: '/api-status', label: 'Integrations', icon: FiWifi },
] as const

export const AppShell = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const pathname = usePathname()

  return (
    <main className='flex min-h-screen bg-slate-100'>
      <aside className='flex w-64 flex-col border-r border-slate-200 bg-white'>
        <div className='border-b border-slate-200 p-4'>
          <p className='text-sm font-semibold text-slate-900'>Home Resource Monitor</p>
          <p className='mt-1 text-xs text-slate-500'>Boilerplate for residential operations</p>
        </div>

        <div className='flex-1 overflow-y-auto p-3'>
          <nav className='space-y-1'>
            {mainLinks.map((item) => {
              const Icon = item.icon
              const isActive = pathname == item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Icon className='size-4' />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className='mt-auto border-t border-slate-200 p-3'>
          <p className='rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500'>Starter kit with local mock data. Replace datasets with your API layer.</p>
        </div>
      </aside>

      <section className='flex min-w-0 flex-1 flex-col'>
        <header className='flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3'>
          <p className='text-sm font-semibold text-slate-800'>Residential Resource Monitoring</p>
          <span className='rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700'>Live boilerplate</span>
        </header>

        <div className='min-w-0 flex-1 p-5'>
          <div className='mb-4 flex items-center justify-between'>
            <h1 className='text-2xl font-semibold text-slate-900'>{title}</h1>
            <div className='flex items-center gap-2 text-xs text-slate-500'>
              <FiBarChart2 className='size-4' />
              Monitoring
            </div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>{children}</div>
        </div>
      </section>
    </main>
  )
}
