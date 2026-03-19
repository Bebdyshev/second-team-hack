'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'default' | 'outline'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  children: ReactNode
}

export const Button = ({ variant = 'default', className = '', children, ...props }: ButtonProps) => {
  const base =
    'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold tracking-[0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
  const variants: Record<ButtonVariant, string> = {
    default: 'border border-slate-900 bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:shadow',
    outline: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
}
