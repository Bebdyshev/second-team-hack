'use client'

import type { TextareaHTMLAttributes } from 'react'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = ({ className = '', ...props }: TextareaProps) => {
  return (
    <textarea
      className={`min-h-[80px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 resize-none ${className}`.trim()}
      {...props}
    />
  )
}
