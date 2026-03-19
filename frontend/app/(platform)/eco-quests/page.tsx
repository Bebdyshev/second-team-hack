'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiCamera, FiCheck } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

type EcoQuest = {
  id: string
  title: string
  description: string
  points: number
  completed: boolean
  category: 'water' | 'energy' | 'waste' | 'transport' | 'other'
}

const DUMMY_QUESTS: EcoQuest[] = [
  { id: 'eq-1', title: 'Turn off lights when leaving', description: 'Switch off lights in rooms you are not using for 3 days.', points: 10, completed: false, category: 'energy' },
  { id: 'eq-2', title: 'Short shower challenge', description: 'Keep showers under 5 minutes for a week.', points: 15, completed: false, category: 'water' },
  { id: 'eq-3', title: 'Sort your recycling', description: 'Separate plastic, paper, and glass for 1 week.', points: 20, completed: false, category: 'waste' },
  { id: 'eq-4', title: 'Use stairs instead of elevator', description: 'Take the stairs for trips under 3 floors for 5 days.', points: 12, completed: false, category: 'transport' },
  { id: 'eq-5', title: 'Fix a dripping tap', description: 'Report or fix a leaky faucet in your apartment.', points: 25, completed: false, category: 'water' },
  { id: 'eq-6', title: 'Unplug idle devices', description: 'Unplug chargers and devices when not in use for 5 days.', points: 12, completed: false, category: 'energy' },
  { id: 'eq-7', title: 'Use reusable bags', description: 'Avoid single-use plastic bags for groceries for 1 week.', points: 18, completed: false, category: 'waste' },
]

const PLANT_IMAGES = ['/plant-growth/1.png', '/plant-growth/2.png', '/plant-growth/3.png', '/plant-growth/4.png', '/plant-growth/5.png', '/plant-growth/6.png', '/plant-growth/7.png'] as const

const CATEGORY_CONFIG: Record<EcoQuest['category'], { label: string; color: string }> = {
  water: { label: 'Water', color: 'text-cyan-700 bg-cyan-50' },
  energy: { label: 'Energy', color: 'text-amber-700 bg-amber-50' },
  waste: { label: 'Waste', color: 'text-emerald-700 bg-emerald-50' },
  transport: { label: 'Transport', color: 'text-blue-700 bg-blue-50' },
  other: { label: 'Other', color: 'text-slate-600 bg-slate-100' },
}

type ActivityDay = { date: string; level: number }

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getWeekDays() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  const days: { date: Date; dateStr: string; label: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push({
      date: d,
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: WEEKDAY_LABELS[i],
    })
  }
  return days
}

function PlantPanel({
  completedCount,
  totalPoints,
  activityDays,
  streak,
  streakBreak,
  userName,
}: {
  completedCount: number
  totalPoints: number
  activityDays: ActivityDay[]
  streak: number
  streakBreak: { date: string; count: number } | null
  userName?: string
}) {
  const stateIndex = Math.min(completedCount, 6)

  const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  const byDate = new Map<string, number>()
  activityDays.forEach((d) => byDate.set(d.date, d.level))

  const weekDays = getWeekDays()
  const todayStr = new Date().toISOString().slice(0, 10)

  const today = new Date()
  const monthsToShow: { year: number; month: number; name: string }[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    monthsToShow.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      name: d.toLocaleString('en', { month: 'long', year: 'numeric' }),
    })
  }

  const buildMonthGrid = (year: number, month: number) => {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const firstWeekday = first.getDay()
    const daysInMonth = last.getDate()
    const rows: ({ date: string; level: number } | null)[][] = []
    let row: ({ date: string; level: number } | null)[] = Array(7).fill(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const level = byDate.get(dateStr) ?? 0
      const wd = (firstWeekday + d - 1) % 7
      row[wd] = { date: dateStr, level }
      if (wd === 6) {
        rows.push([...row])
        row = Array(7).fill(null)
      }
    }
    if (row.some((c) => c !== null)) rows.push(row)
    return rows
  }

  const firstName = userName?.split(/\s+/)[0] || 'there'

  const streakSubtext =
    streak > 0
      ? `You are doing really great, ${firstName}!`
      : streakBreak
        ? (() => {
            const d = streakBreak.date
            const today = new Date().toISOString().slice(0, 10)
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            const yesterdayStr = yesterday.toISOString().slice(0, 10)
            const dayLabel =
              d === today ? 'Today' : d === yesterdayStr ? 'Yesterday' : `On ${new Date(d + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
            return streakBreak.count === 0
              ? `${dayLabel} you did 0 tasks — complete all 7 to keep your streak!`
              : `${dayLabel} you did ${streakBreak.count}/7 tasks — complete all 7 to keep your streak!`
          })()
        : 'Complete all 7 tasks daily to build your streak'

  return (
    <div className='flex h-full w-full flex-col bg-gradient-to-b from-emerald-50/30 to-white'>
      <div className='shrink-0 px-4 py-3'>
        <h3 className='text-sm font-semibold text-slate-800'>Your plant</h3>
        <p className='mt-0.5 text-[10px] text-slate-500'>
          Stage {stateIndex + 1} of 7 · {totalPoints} pts
        </p>
      </div>

      {/* Week Streak card */}
      <div className='shrink-0 px-4 pb-4'>
        <div className='rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-5 shadow-sm'>
          <div className='flex flex-col items-center'>
            <div className='relative flex h-24 items-center justify-center'>
              <div className='flex size-16 items-center justify-center rounded-full border-2 border-slate-200'>
                <span className='text-2xl' style={{ filter: 'drop-shadow(0 2px 4px rgba(251,146,60,0.35))' }}>🔥</span>
              </div>
              <span
                className='absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 text-4xl font-bold tracking-tight text-slate-900'
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
              >
                {streak}
              </span>
            </div>
            <h4 className='mt-6 text-sm font-bold text-slate-900'>Day Streak</h4>
            <p className='mt-1 text-center text-xs text-slate-500'>
              {streakSubtext}
            </p>
            <div className='mt-5 flex w-full justify-between gap-1'>
              {weekDays.map(({ date, dateStr, label }) => {
                const level = byDate.get(dateStr) ?? 0
                const isComplete = level >= 4
                const isToday = dateStr === todayStr
                const isFuture = dateStr > todayStr
                return (
                  <div key={dateStr} className='flex flex-1 flex-col items-center gap-1.5'>
                    <span className='text-[10px] text-slate-400'>{label}</span>
                    {isComplete ? (
                      <div className='flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm'>
                        <FiCheck className='size-4 text-white' strokeWidth={2.5} />
                      </div>
                    ) : (
                      <span
                        className={`text-sm font-bold ${isToday ? 'text-slate-900' : isFuture ? 'text-slate-300' : 'text-slate-400'}`}
                      >
                        {date.getDate()}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4'>
        <p className='mb-3 text-xs font-medium text-slate-600'>Activity</p>
        <div className='flex flex-col gap-4'>
        {monthsToShow.map(({ year, month, name }) => {
          const grid = buildMonthGrid(year, month)
          return (
            <div key={name} className='rounded-xl border border-slate-200 bg-white p-3 shadow-sm'>
              <p className='mb-2 text-xs font-semibold text-slate-700'>{name}</p>
              <div className='flex flex-col gap-1'>
                <div className='flex gap-1'>
                  {DAY_LABELS.map((l) => (
                    <div key={l} className='flex flex-1 justify-center'>
                      <span className='text-[10px] text-slate-500'>{l}</span>
                    </div>
                  ))}
                </div>
                {grid.map((week, wi) => (
                  <div key={wi} className='flex gap-1'>
                    {week.map((cell, di) => (
                      <div
                        key={di}
                        className='h-3 flex-1 min-w-0 rounded-sm transition-colors'
                        style={{
                          backgroundColor: cell
                            ? COLORS[Math.min(cell.level, 4)]
                            : 'transparent',
                        }}
                        title={
                          cell?.date
                            ? `${cell.date}: ${
                                cell.level === 0
                                  ? 'No activity'
                                  : cell.level === 4
                                    ? 'All 7 done'
                                    : 'Some activity'
                              }`
                            : ''
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        </div>
        <div className='mt-4 flex items-center justify-end gap-2 text-[10px] text-slate-500'>
          <span>Less</span>
          {COLORS.map((color, i) => (
            <div key={i} className='size-3 rounded-sm' style={{ backgroundColor: color }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

export default function EcoQuestsPage() {
  const router = useRouter()
  const { activeRole, accessToken, user } = useAuth()
  const [quests, setQuests] = useState<EcoQuest[]>(DUMMY_QUESTS)
  const [activityDays, setActivityDays] = useState<ActivityDay[]>([])
  const [streak, setStreak] = useState(0)
  const [streakBreak, setStreakBreak] = useState<{ date: string; count: number } | null>(null)
  const [photoByQuest, setPhotoByQuest] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    if (activeRole === 'Manager') {
      router.replace('/tasks-board')
    }
  }, [activeRole, router])

  const fetchStatus = useCallback(async () => {
    if (!accessToken || activeRole !== 'Resident') return
    try {
      const status = await apiRequest<{ completed: string[]; completed_count: number; total_points: number }>(
        '/eco-quests/status',
        { token: accessToken }
      )
      setQuests((prev) =>
        prev.map((q) => ({ ...q, completed: status.completed.includes(q.id) }))
      )
    } catch {
      // DB may be unavailable
    }
  }, [accessToken, activeRole])

  const fetchActivity = useCallback(async () => {
    if (!accessToken || activeRole !== 'Resident') return
    try {
      const res = await apiRequest<{ days: ActivityDay[] }>('/eco-quests/activity', { token: accessToken })
      setActivityDays(res.days)
    } catch {
      setActivityDays([])
    }
  }, [accessToken, activeRole])

  const fetchStreak = useCallback(async () => {
    if (!accessToken || activeRole !== 'Resident') return
    try {
      const res = await apiRequest<{
        current_streak: number
        streak_break_date: string | null
        streak_break_count: number | null
      }>('/eco-quests/streak', { token: accessToken })
      setStreak(res.current_streak)
      setStreakBreak(res.streak_break_date ? { date: res.streak_break_date, count: res.streak_break_count ?? 0 } : null)
    } catch {
      setStreak(0)
      setStreakBreak(null)
    }
  }, [accessToken, activeRole])

  useEffect(() => {
    void fetchStatus()
    void fetchActivity()
    void fetchStreak()
  }, [fetchStatus, fetchActivity, fetchStreak])

  const handlePhotoChange = (questId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result as string
      setPhotoByQuest((p) => ({ ...p, [questId]: data }))
    }
    reader.readAsDataURL(file)
  }

  const handleComplete = async (id: string) => {
    const photo = photoByQuest[id]
    if (!photo) return
    if (!accessToken) return
    setSubmitting(id)
    try {
      await apiRequest('/eco-quests/complete', {
        method: 'POST',
        token: accessToken,
        body: { quest_id: id, photo_base64: photo },
      })
      setPhotoByQuest((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      await fetchStatus()
      await fetchActivity()
      await fetchStreak()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to complete')
    } finally {
      setSubmitting(null)
    }
  }

  if (activeRole === 'Manager') {
    return null
  }

  const completedCount = quests.filter((q) => q.completed).length
  const totalPoints = quests.filter((q) => q.completed).reduce((s, q) => s + q.points, 0)

  return (
    <AppShell
      title='Eco Quests'
      subtitle='Complete tasks to grow your plant and earn points'
      rightPanel={
        <PlantPanel
          completedCount={completedCount}
          totalPoints={totalPoints}
          activityDays={activityDays}
          streak={streak}
          streakBreak={streakBreak}
          userName={user?.full_name}
        />
      }
      rightPanelClassName='shadow-none'
      rightPanelScroll
    >
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <div className='flex gap-3'>
            <span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700'>
              {completedCount} / {quests.length} completed
            </span>
            <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600'>
              {totalPoints} pts
            </span>
          </div>
        </div>

        {/* Plant growth state - full image, no cropping */}
        <div className='flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-slate-200 bg-gradient-to-b from-emerald-50/50 to-white p-4'>
          <div className='flex shrink-0 flex-col items-center'>
            <div className='w-[260px] sm:w-[320px]'>
              <AnimatePresence mode='wait' initial={false}>
                <motion.div
                  key={Math.min(completedCount, 6)}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                  className='flex items-center justify-center'
                >
                  <img
                    src={PLANT_IMAGES[Math.min(completedCount, 6)]}
                    alt={`Plant stage ${Math.min(completedCount, 6) + 1}`}
                    className='w-full h-auto block'
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className='mt-2 flex gap-1'>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 w-2 rounded-full transition-colors ${
                    i <= Math.min(completedCount, 6) ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className='flex flex-1 flex-col justify-center text-center sm:text-left'>
            <p className='text-sm font-semibold text-slate-700'>Your plant</p>
            <p className='mt-0.5 text-xs text-slate-500'>
              Stage {Math.min(completedCount, 6) + 1} of 7 · Complete tasks to grow
            </p>
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          {quests.map((quest) => {
            const cat = CATEGORY_CONFIG[quest.category]
            const hasPhoto = !!photoByQuest[quest.id]
            const canSubmit = !quest.completed && hasPhoto
            return (
              <article
                key={quest.id}
                className={`rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow ${
                  quest.completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'
                }`}
              >
                <div className='flex flex-col gap-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <div className='mb-1.5 flex flex-wrap items-center gap-1.5'>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cat.color}`}>
                          {cat.label}
                        </span>
                        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600'>
                          +{quest.points} pts
                        </span>
                        {quest.completed && (
                          <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700'>
                            <FiCheck className='size-3' /> Done
                          </span>
                        )}
                      </div>
                      <h3 className='text-sm font-semibold text-slate-800'>{quest.title}</h3>
                      <p className='mt-1 text-xs leading-snug text-slate-500'>{quest.description}</p>
                    </div>
                  </div>
                  {!quest.completed && (
                    <div className='flex flex-col gap-2'>
                      <label className='flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2 text-xs transition-colors hover:border-emerald-400 hover:bg-emerald-50/30'>
                        <FiCamera className='size-4 text-slate-500' />
                        <span className={hasPhoto ? 'font-medium text-emerald-700' : 'text-slate-600'}>
                          {hasPhoto ? 'Photo added' : 'Add photo to complete'}
                        </span>
                        <input
                          type='file'
                          accept='image/*'
                          capture='environment'
                          className='hidden'
                          onChange={(e) => handlePhotoChange(quest.id, e)}
                        />
                      </label>
                      {hasPhoto && (
                        <div className='relative'>
                          <img
                            src={photoByQuest[quest.id]}
                            alt='Preview'
                            className='h-20 w-20 rounded-lg object-cover'
                          />
                          <button
                            type='button'
                            onClick={() => setPhotoByQuest((p) => ({ ...p, [quest.id]: '' }))}
                            className='absolute -right-1 -top-1 rounded-full bg-slate-600 px-1.5 py-0.5 text-[10px] text-white'
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <button
                        type='button'
                        onClick={() => handleComplete(quest.id)}
                        disabled={!canSubmit || submitting === quest.id}
                        className='shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
                      >
                        {submitting === quest.id ? 'Submitting…' : 'Complete'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
