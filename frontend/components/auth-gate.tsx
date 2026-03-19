'use client'

import Link from 'next/link'

import { useAuth } from '@/context/auth-context'

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { isReady, isAuthenticated } = useAuth()

  if (!isReady) {
    return <main className='mx-auto max-w-6xl px-6 py-10 text-slate-600'>Loading session...</main>
  }

  if (!isAuthenticated) {
    return (
      <main className='mx-auto max-w-6xl px-6 py-10'>
        <p className='text-slate-700'>Session required to open this module.</p>
        <div className='mt-4 flex gap-3'>
          <Link href='/login' className='rounded-lg bg-slate-900 px-4 py-2 text-white'>
            Login
          </Link>
          <Link href='/register' className='rounded-lg border border-slate-300 px-4 py-2 text-slate-700'>
            Register
          </Link>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
