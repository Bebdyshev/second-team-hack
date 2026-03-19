'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type TourStep = {
  id: string
  selector: string
  title: string
  description: string
}

type ActiveRole = string | null

type OnboardingProps = {
  pathname: string
  activeRole: ActiveRole
  startToken?: number
}

type TooltipPlacement = 'top' | 'bottom'

type TooltipPosition = {
  top: number
  left: number
  arrowLeft: number
  placement: TooltipPlacement
}

type RectState = {
  top: number
  left: number
  width: number
  height: number
}

const TOOLTIP_WIDTH = 320
const TOOLTIP_HEIGHT = 186
const SAFE_GAP = 16

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const normalizePath = (pathname: string) => {
  if (pathname.startsWith('/workspace-shell/')) return '/workspace-shell'
  if (pathname.startsWith('/workspace-shell')) return '/workspace-shell'
  return pathname
}

const pageLabel = (path: string, activeRole: ActiveRole) => {
  const labels: Record<string, string> = {
    '/dashboard': 'Overview dashboard',
    '/workspace-shell': activeRole == 'Manager' ? 'Buildings workspace' : 'Apartment workspace',
    '/tasks-board': 'Tasks board',
    '/meters': 'Meters',
    '/alerts': 'Alerts',
    '/maintenance': 'Maintenance',
    '/reports': 'Reports',
    '/tickets': 'Tickets',
    '/tasks': 'Tasks',
    '/api-status': 'API status',
  }
  return labels[path] ?? 'Page workspace'
}

const pageMainDescription = (path: string, activeRole: ActiveRole) => {
  const descriptions: Record<string, string> = {
    '/dashboard':
      'Use this page as your operational cockpit: top KPIs show health at a glance, resource cards show 24h trends, and bottom panels show anomalies, assets and blockchain proofs',
    '/workspace-shell':
      activeRole == 'Manager'
        ? 'Inspect building and apartment performance, compare units, and drill down into apartments with weak score or active anomalies'
        : 'Track your apartment metrics, review trends, and watch anomaly history to understand consumption and comfort changes',
    '/tasks-board':
      'Manage operational workflow in columns, open task details from cards, and use contextual actions to resolve issues faster',
    '/meters':
      'Monitor meter fleet status, signal quality and raw stream events to detect stale packets, drops and telemetry delays',
    '/alerts':
      'Review severity-ranked anomaly feed, prioritize critical signals first, and use resource tags to route incidents quickly',
    '/maintenance':
      'Track maintenance activities and follow execution status from planning to completion',
    '/reports':
      'Open transparent monthly reporting: consumption totals, anomaly log, and on-chain anchors for resident verification',
    '/tickets':
      'Residents can submit and track complaints, while managers process ticket states and escalate based on category and urgency',
    '/api-status':
      'Check integration health and ingestion freshness for external systems and telemetry gateways',
  }
  return descriptions[path] ?? 'This section contains the main workspace for data, actions and verification'
}

const buildSteps = (pathname: string, activeRole: ActiveRole): TourStep[] => {
  const path = normalizePath(pathname)
  const pageName = pageLabel(path, activeRole)

  const baseSteps: TourStep[] = [
    {
      id: 'main-content',
      selector: "[data-tour='page-content']",
      title: pageName,
      description: pageMainDescription(path, activeRole),
    },
  ]

  if (path == '/dashboard') {
    return [
      ...baseSteps,
      {
        id: 'dashboard-kpis',
        selector: "[data-tour='dashboard-kpis']",
        title: 'KPI control strip',
        description:
          'These widgets summarize operational state: property scope, active alerts, occupancy/eco score and meter reliability',
      },
      {
        id: 'dashboard-resources',
        selector: "[data-tour='dashboard-resources']",
        title: 'Resource dynamics',
        description:
          'Each card shows 24h trendline, total usage and direction change vs start of the interval for electricity, water, gas and heating',
      },
      {
        id: 'dashboard-panels',
        selector: "[data-tour='dashboard-panels']",
        title: 'Operational detail panels',
        description:
          'Bottom panels provide actionable context: entities list, anomaly stream, and recent blockchain proof entries with verification links',
      },
    ]
  }

  return baseSteps
}

const seenKey = (pathname: string, activeRole: ActiveRole) => {
  const path = normalizePath(pathname)
  return `resmonitor:onboarding:${path}:${activeRole ?? 'user'}`
}

export const AppOnboarding = ({ pathname, activeRole, startToken = 0 }: OnboardingProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<RectState | null>(null)
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null)

  const steps = useMemo(() => buildSteps(pathname, activeRole), [pathname, activeRole])
  const totalSteps = steps.length

  const getElement = useCallback((index: number): HTMLElement | null => {
    const step = steps[index]
    if (!step) return null
    return document.querySelector(step.selector) as HTMLElement | null
  }, [steps])

  const findFirstAvailableStep = useCallback(() => {
    for (let i = 0; i < steps.length; i += 1) {
      if (getElement(i)) return i
    }
    return -1
  }, [steps, getElement])

  const moveStep = useCallback((direction: 1 | -1) => {
    let next = stepIndex + direction
    while (next >= 0 && next < steps.length) {
      if (getElement(next)) {
        setStepIndex(next)
        return true
      }
      next += direction
    }
    return false
  }, [stepIndex, steps.length, getElement])

  const closeAndRemember = useCallback(() => {
    if (typeof window == 'undefined') return
    localStorage.setItem(seenKey(pathname, activeRole), '1')
    setIsOpen(false)
  }, [pathname, activeRole])

  const recalcPosition = useCallback(() => {
    if (!isOpen) return
    const target = getElement(stepIndex)
    if (!target) return

    const rect = target.getBoundingClientRect()
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })

    const idealLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
    const left = clamp(idealLeft, SAFE_GAP, window.innerWidth - TOOLTIP_WIDTH - SAFE_GAP)

    const canPlaceTop = rect.top >= TOOLTIP_HEIGHT + 28
    const topPlacement = canPlaceTop ? rect.top - TOOLTIP_HEIGHT - 14 : rect.bottom + 14
    const placement: TooltipPlacement = canPlaceTop ? 'top' : 'bottom'

    const top = clamp(topPlacement, SAFE_GAP, window.innerHeight - TOOLTIP_HEIGHT - SAFE_GAP)
    const arrowLeft = clamp(rect.left + rect.width / 2 - left, 18, TOOLTIP_WIDTH - 18)

    setTooltipPos({ top, left, arrowLeft, placement })
  }, [isOpen, stepIndex, getElement])

  useEffect(() => {
    if (typeof window == 'undefined') return
    if (!steps.length) return

    const shouldOpen = localStorage.getItem(seenKey(pathname, activeRole)) != '1'
    if (!shouldOpen) return

    const first = findFirstAvailableStep()
    if (first < 0) return
    setStepIndex(first)
    setIsOpen(true)
  }, [steps, pathname, activeRole, findFirstAvailableStep])

  useEffect(() => {
    if (startToken <= 0) return
    const first = findFirstAvailableStep()
    if (first < 0) return
    setStepIndex(first)
    setIsOpen(true)
  }, [startToken, findFirstAvailableStep])

  useEffect(() => {
    if (!isOpen) return
    const target = getElement(stepIndex)
    if (target) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    }
    recalcPosition()
    const timerId = window.setTimeout(() => recalcPosition(), 180)
    const onChange = () => recalcPosition()
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.clearTimeout(timerId)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [isOpen, stepIndex, recalcPosition, getElement])

  if (!isOpen || !steps[stepIndex] || !targetRect || !tooltipPos) return null

  const step = steps[stepIndex]
  const isFirst = stepIndex == 0
  const isLast = !steps.slice(stepIndex + 1).some((_, idx) => getElement(stepIndex + idx + 1))

  const handleNext = () => {
    if (isLast) {
      closeAndRemember()
      return
    }
    const moved = moveStep(1)
    if (!moved) closeAndRemember()
  }

  const handlePrev = () => {
    if (isFirst) return
    moveStep(-1)
  }

  return (
    <div className='pointer-events-none fixed inset-0 z-[120]'>
      <div className='absolute inset-0 bg-slate-950/45' />

      <div
        className='absolute rounded-xl border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] transition-all duration-200'
        style={{
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
        }}
      />

      <div
        className='pointer-events-auto absolute w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl'
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div
          className={`absolute h-0 w-0 border-l-[8px] border-r-[8px] border-transparent ${
            tooltipPos.placement == 'top'
              ? 'bottom-[-8px] border-t-[8px] border-t-white'
              : 'top-[-8px] border-b-[8px] border-b-white'
          }`}
          style={{ left: tooltipPos.arrowLeft - 8 }}
        />

        <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-400'>
          Onboarding
        </p>
        <h3 className='mt-1 text-sm font-semibold text-slate-900'>{step.title}</h3>
        <p className='mt-1.5 text-sm leading-relaxed text-slate-600'>{step.description}</p>

        <div className='mt-4 flex items-center justify-between gap-2'>
          <button
            type='button'
            onClick={closeAndRemember}
            className='rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100'
          >
            Skip
          </button>

          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={handlePrev}
              disabled={isFirst}
              className='rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              Back
            </button>
            <button
              type='button'
              onClick={handleNext}
              className='rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800'
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>

        <p className='mt-2 text-right text-[11px] text-slate-400'>
          Step {stepIndex + 1} / {totalSteps}
        </p>
      </div>
    </div>
  )
}
