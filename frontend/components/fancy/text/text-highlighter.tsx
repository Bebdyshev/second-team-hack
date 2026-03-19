'use client'

import { useMemo, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import type { Transition } from 'framer-motion'

type InViewOptions = {
  once?: boolean
  initial?: boolean
  amount?: number | 'some' | 'all'
}

type TextHighlighterProps = {
  children: string
  className?: string
  highlightColor?: string
  transition?: Transition
  useInViewOptions?: InViewOptions
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  duration: 1,
  delay: 0.2,
  bounce: 0,
}

export const TextHighlighter = ({
  children,
  className = 'rounded-[0.3em] px-px',
  highlightColor = '#F2AD91',
  transition = DEFAULT_TRANSITION,
  useInViewOptions = { once: true, initial: true, amount: 0.05 },
}: TextHighlighterProps) => {
  const targetRef = useRef<HTMLSpanElement | null>(null)
  const isInView = useInView(targetRef, useInViewOptions)

  const safeText = useMemo(() => children ?? '', [children])

  return (
    <span ref={targetRef} className={`relative inline-block isolate align-baseline ${className}`}>
      <motion.span
        aria-hidden='true'
        className='absolute inset-0 z-0 rounded-[inherit]'
        style={{ backgroundColor: highlightColor, transformOrigin: 'left center' }}
        initial={{ scaleX: 0, opacity: 0.75 }}
        animate={isInView ? { scaleX: 1, opacity: 1 } : { scaleX: 1, opacity: 0.55 }}
        transition={transition}
      />
      <span className='relative z-10 text-white'>{safeText}</span>
    </span>
  )
}
