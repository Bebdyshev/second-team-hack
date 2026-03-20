'use client'

import type { ComponentProps } from 'react'
import { LoaderIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export const Spinner = ({ className, ...props }: ComponentProps<'svg'>) => (
  <LoaderIcon
    role='status'
    aria-label='Loading'
    className={cn('size-4 animate-spin', className)}
    {...props}
  />
)
