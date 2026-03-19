'use client'

import { AuthGate } from '@/components/auth-gate'

const PlatformLayout = ({ children }: { children: React.ReactNode }) => {
  return <AuthGate>{children}</AuthGate>
}

export default PlatformLayout
