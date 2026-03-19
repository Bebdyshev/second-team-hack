import './globals.css'
import 'sonner/dist/styles.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Providers } from '@/components/providers'

export const metadata: Metadata = {
  title: 'Residential Resource Monitor Boilerplate',
  description: 'Starter frontend for monitoring house electricity, water, gas and heating resources',
}

type RootLayoutProps = {
  children: ReactNode
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang='en'>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

export default RootLayout
