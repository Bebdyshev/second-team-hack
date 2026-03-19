'use client'

import type { LabelHTMLAttributes } from 'react'

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export const Label = ({ className = '', ...props }: LabelProps) => {
  return (
    <label
      className={`text-sm font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${className}`.trim()}
      {...props}
    />
  )
}
