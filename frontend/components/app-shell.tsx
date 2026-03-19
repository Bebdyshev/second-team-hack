'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FiAlertTriangle,
  FiBarChart2,
  FiDatabase,
  FiFileText,
  FiGrid,
  FiHome,
  FiLayers,
  FiLogOut,
  FiSettings,
  FiTool,
  FiWifi,
  FiZap,
} from 'react-icons/fi'
import { useAuth } from '@/context/auth-context'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const mainLinks: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: FiGrid },
  { href: '/workspace-shell', label: 'Buildings', icon: FiHome },
  { href: '/tasks-board', label: 'Consumption', icon: FiBarChart2 },
  { href: '/data-tables', label: 'Meters', icon: FiDatabase },
  { href: '/knowledge-base', label: 'Alerts', icon: FiAlertTriangle },
  { href: '/agents', label: 'Maintenance', icon: FiTool },
  { href: '/legal-assistant', label: 'Reports', icon: FiFileText },
  { href: '/api-status', label: 'Integrations', icon: FiWifi },
]

type AppShellProps = {
  title: string
  subtitle?: string
  children: React.ReactNode
  rightPanel?: React.ReactNode
  rightPanelOpen?: boolean
}

const PANEL_WIDTH = 360

export const AppShell = ({ title, subtitle, children, rightPanel, rightPanelOpen = true }: AppShellProps) => {
  const pathname = usePathname()
  const router = useRouter()
  const { user, activeRole, logout } = useAuth()

  const userName = user?.full_name || 'User'
  const userEmail = user?.email || 'user@resmonitor.kz'
  const userInitial = (userName[0] || 'U').toUpperCase()

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <main className={`flex ${rightPanel ? 'h-screen overflow-hidden' : 'min-h-screen items-start'} bg-[#f0f2f5]`}>
      <aside className='sticky top-0 flex h-screen w-60 shrink-0 self-start flex-col border-r border-slate-200 bg-white'>
        {/* Logo */}
        <div className='flex items-center gap-3 px-5 py-5'>
          <div>
            <p className='text-sm font-semibold text-slate-900'>ResMonitor</p>
            <p className='text-[10px] text-slate-500'>Smart Building OS</p>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto px-3 pb-4 scrollbar-hide'>
          <p className='mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400'>Navigation</p>
          <nav className='space-y-0.5'>
            {mainLinks.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className='size-4 shrink-0' />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className='border-t border-slate-200 px-3 py-3'>
          <Link
            href='/api-status'
            className='flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900'
          >
            <FiSettings className='size-4' />
            Settings
          </Link>
          <div className='mt-3 flex items-center gap-2.5 px-1'>
            <div className='flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-violet-500 text-[10px] font-bold text-white'>
              {userInitial}
            </div>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-xs font-medium text-slate-800'>{activeRole || 'User'}</p>
              <p className='truncate text-[10px] text-slate-500'>{userEmail}</p>
            </div>
          </div>
          <button
            type='button'
            onClick={handleLogout}
            className='mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700'
            aria-label='Log out'
          >
            <FiLogOut className='size-4' />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <section className='flex min-w-0 flex-1 flex-col'>
        {/* Topbar */}
        <header className='flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5'>
          <div>
            <h1 className='text-base font-semibold text-slate-900'>{title}</h1>
            {subtitle && <p className='text-xs text-slate-500'>{subtitle}</p>}
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'>
              <span className='size-1.5 animate-pulse rounded-full bg-emerald-500' />
              Live
            </div>
            <div className='text-xs text-slate-400'>
              {new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Page body */}
        <div className='relative flex min-h-0 flex-1 overflow-hidden'>
          <div
            className='min-w-0 flex-1 overflow-auto p-6'
            style={{
              paddingRight: rightPanel && rightPanelOpen ? PANEL_WIDTH + 24 : 24,
            }}
          >
            {children}
          </div>
          {rightPanel && (
            <div
              className='absolute bottom-0 right-0 top-0 z-40 overflow-hidden border-l border-slate-200 bg-white shadow-sm'
              style={{
                width: PANEL_WIDTH,
                transform: rightPanelOpen ? 'translateX(0)' : 'translateX(100%)',
                opacity: rightPanelOpen ? 1 : 0.98,
                transition: 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease-out',
                willChange: 'transform',
                pointerEvents: rightPanelOpen ? 'auto' : 'none',
              }}
            >
              <div style={{ width: PANEL_WIDTH }} className='flex h-full flex-col'>
                {rightPanel}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
