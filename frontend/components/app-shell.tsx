'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart,
  FiDatabase,
  FiHome,
  FiLayers,
  FiLogOut,
  FiMessageCircle,
  FiTrendingUp,
  FiWifi,
} from 'react-icons/fi'
import { useAuth } from '@/context/auth-context'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  managerOnly?: boolean
  residentOnly?: boolean
  labelManager?: string
}

const mainLinks: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: FiHome },
  { href: '/workspace-shell', label: 'My Apartment', labelManager: 'Buildings', icon: FiLayers },
  { href: '/tasks-board', label: 'Daily Tasks', icon: FiBarChart },
  { href: '/data-tables', label: 'Meters', icon: FiDatabase },
  { href: '/knowledge-base', label: 'Alerts', icon: FiAlertTriangle },
  { href: '/agents', label: 'Maintenance', icon: FiActivity },
  { href: '/legal-assistant', label: 'Reports', icon: FiTrendingUp },
  { href: '/tickets', label: 'Tickets', icon: FiMessageCircle, residentOnly: true },
  { href: '/api-status', label: 'Integrations', icon: FiWifi, managerOnly: true },
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
          <nav className='space-y-1'>
            {mainLinks
              .filter((item) => {
                if (item.managerOnly && activeRole !== 'Manager') return false
                if (item.residentOnly && activeRole !== 'Resident') return false
                return true
              })
              .map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              const displayLabel = activeRole === 'Manager' && item.labelManager ? item.labelManager : item.label
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
                >
                  <span
                    className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-opacity ${
                      isActive ? 'bg-blue-500 opacity-100' : 'opacity-0 group-hover:opacity-50'
                    }`}
                  />
                  <span
                    className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md transition-colors ${
                      isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'
                    }`}
                  >
                    <Icon className='size-[15px]' />
                  </span>
                  {displayLabel}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className='border-t border-slate-200 px-3 py-3'>
          <button
            type='button'
            onClick={handleLogout}
            className='group mt-2 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-100'
            aria-label='Log out from account'
          >
            <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-violet-500 text-[10px] font-bold text-white'>
              {userInitial}
            </div>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-xs font-medium text-slate-800'>{activeRole || 'User'}</p>
              <p className='truncate text-[10px] text-slate-500'>{userEmail}</p>
            </div>
            <span className='inline-flex size-6 shrink-0 items-center justify-center rounded-md text-rose-500 opacity-0 transition-all duration-150 group-hover:opacity-100 group-hover:bg-rose-50 group-hover:text-rose-600'>
              <FiLogOut className='size-4' />
            </span>
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
