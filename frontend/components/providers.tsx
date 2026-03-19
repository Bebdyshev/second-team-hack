'use client'

import { AuthProvider } from '@/context/auth-context'
import { LanguageProvider } from '@/context/language-context'
import { Toaster } from 'sonner'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <LanguageProvider>
      <AuthProvider>
        {children}
        <Toaster richColors position='top-right' closeButton />
      </AuthProvider>
    </LanguageProvider>
  )
}
