'use client'

import { FiArrowDownRight, FiArrowUpRight } from 'react-icons/fi'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type ResourceKey = 'electricity' | 'water' | 'gas' | 'heating'

type HouseItem = {
  id: string
  name: string
  address: string
  units_count: number
  occupancy_rate: number
}

type ResourceAlert = {
  id: string
  house_name: string
  resource: ResourceKey
  severity: 'low' | 'medium' | 'high'
  title: string
  detected_at: string
}

type MeterItem = {
  id: string
  signal_strength: 'good' | 'weak' | 'offline'
}

type HouseSummary = {
  total_power: number
  total_water: number
  average_air: number
  city_impact: number
  alerts_count: number
}

type DynamicsResponse = {
  dynamics: Array<{ label: string; value: number }>
}

type ManagerActionProof = {
  id: string
  action_type: string
  status: 'pending' | 'confirmed' | 'failed'
  tx_hash: string
  explorer_url: string
  created_at: string
}

type ApartmentSummaryResponse = {
  apartment: { id: string; number: string; score: number; status: string }
  live_snapshot: { electricity: number; water: number; co2: number; humidity: number; savings: number }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RESOURCE_CONFIG: Record<ResourceKey, { label: string; unit: string; chart: string; bar: string }> = {
  electricity: { label: 'Electricity', unit: 'kWh',  chart: '#f59e0b', bar: 'bg-amber-400'  },
  water:       { label: 'Water',       unit: 'L',    chart: '#3b82f6', bar: 'bg-blue-400'   },
  gas:         { label: 'Gas',         unit: 'm³',   chart: '#f97316', bar: 'bg-orange-400' },
  heating:     { label: 'Heating',     unit: 'Gcal', chart: '#f43f5e', bar: 'bg-rose-400'   },
}

const RESOURCE_LABEL_COLOR: Record<ResourceKey, string> = {
  electricity: 'text-amber-600',
  water:       'text-blue-600',
  gas:         'text-orange-600',
  heating:     'text-rose-600',
}

const SEVERITY_CONFIG = {
  high:   { badge: 'bg-rose-100 text-rose-700',   dot: 'bg-rose-500'  },
  medium: { badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  low:    { badge: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-400' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StatCard = ({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string | number
  sub: string
  trend?: 'up' | 'down' | 'neutral'
}) => (
  <div className='flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5'>
    <p className='text-sm font-medium text-slate-500'>{label}</p>
    <div>
      <p className='text-3xl font-bold tracking-tight text-slate-900'>{value}</p>
      <p className={`mt-1 flex items-center gap-1 text-xs ${trend === 'up' ? 'text-rose-500' : trend === 'down' ? 'text-emerald-500' : 'text-slate-400'}`}>
        {trend === 'up' && <FiArrowUpRight className='size-3' />}
        {trend === 'down' && <FiArrowDownRight className='size-3' />}
        {sub}
      </p>
    </div>
  </div>
)

const SparklineCard = ({
  resourceKey,
  value,
  unit,
  delta,
  data,
}: {
  resourceKey: ResourceKey
  value: number
  unit: string
  delta: number
  data: Array<{ label: string; value: number }>
}) => {
  const cfg = RESOURCE_CONFIG[resourceKey]
  const labelColor = RESOURCE_LABEL_COLOR[resourceKey]
  const isUp = delta > 0

  return (
    <div className='flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 overflow-hidden'>
      <div className='flex items-center justify-between'>
        <p className={`text-sm font-semibold ${labelColor}`}>{cfg.label}</p>
        <span className={`flex items-center gap-1 text-xs font-semibold ${isUp ? 'text-rose-500' : 'text-emerald-600'}`}>
          {isUp ? <FiArrowUpRight className='size-3' /> : <FiArrowDownRight className='size-3' />}
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>

      <div>
        <p className='text-2xl font-bold text-slate-900'>
          {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          <span className='ml-1 text-sm font-normal text-slate-400'>{unit}</span>
        </p>
        <p className='text-[11px] text-slate-400'>24h total</p>
      </div>

      {data.length > 1 && (
        <div className='h-14 -mx-1'>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${resourceKey}`} x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor={cfg.chart} stopOpacity={0.25} />
                  <stop offset='100%' stopColor={cfg.chart} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                itemStyle={{ color: cfg.chart }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area
                type='monotone'
                dataKey='value'
                stroke={cfg.chart}
                strokeWidth={1.5}
                fill={`url(#grad-${resourceKey})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const SectionHeader = ({ title, count, href }: { title: string; count?: number; href?: string }) => (
  <div className='mb-4 flex items-center justify-between'>
    <h2 className='text-sm font-semibold text-slate-900'>{title}</h2>
    <div className='flex items-center gap-2'>
      {count !== undefined && (
        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'>{count}</span>
      )}
      {href && (
        <Link href={href} className='text-xs text-blue-600 hover:underline'>View all</Link>
      )}
    </div>
  </div>
)

// ── Page ──────────────────────────────────────────────────────────────────────

const DashboardPage = () => {
  const { accessToken, activeOrganizationId, user, activeRole } = useAuth()
  const [houses, setHouses] = useState<HouseItem[]>([])
  const [alerts, setAlerts] = useState<ResourceAlert[]>([])
  const [meters, setMeters] = useState<MeterItem[]>([])
  const [summary, setSummary] = useState<HouseSummary | null>(null)
  const [apartmentNumber, setApartmentNumber] = useState<string | null>(null)
  const [apartmentScore, setApartmentScore] = useState<number | null>(null)
  const [electricityDelta, setElectricityDelta] = useState(0)
  const [waterDelta, setWaterDelta] = useState(0)
  const [proofs, setProofs] = useState<ManagerActionProof[]>([])
  const [sparkElec, setSparkElec] = useState<Array<{ label: string; value: number }>>([])
  const [sparkWater, setSparkWater] = useState<Array<{ label: string; value: number }>>([])
  const [pageError, setPageError] = useState('')

  const activeHouseId = activeOrganizationId ?? 'house-1'
  const isResident = activeRole === 'Resident'
  const myApartmentId = user?.apartment_id

  useEffect(() => {
    const load = async () => {
      if (!accessToken) return
      setPageError('')
      try {
        if (isResident && myApartmentId) {
          const [aptSummary, elecDyn, waterDyn, alertsRes, metersRes, proofsRes] = await Promise.all([
            apiRequest<ApartmentSummaryResponse>(`/apartments/${myApartmentId}/summary`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/apartments/${myApartmentId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/apartments/${myApartmentId}/dynamics?resource=water&period=24h`, { token: accessToken }),
            apiRequest<ResourceAlert[]>(`/alerts?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<MeterItem[]>(`/meters?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<ManagerActionProof[]>(`/manager-actions/proofs?house_id=${activeHouseId}`, { token: accessToken }),
          ])
          const elecVals = elecDyn.dynamics.map((d) => d.value)
          const waterVals = waterDyn.dynamics.map((d) => d.value)
          setSummary({
            total_power: elecVals.reduce((a, b) => a + b, 0),
            total_water: waterVals.reduce((a, b) => a + b, 0),
            average_air: Math.round(aptSummary.live_snapshot.co2),
            city_impact: Math.min(84, Math.max(18, Math.round(elecVals.reduce((a, b) => a + b, 0) / 16))),
            alerts_count: 0,
          })
          setApartmentNumber(aptSummary.apartment.number)
          setApartmentScore(aptSummary.apartment.score)
          setAlerts(alertsRes)
          setMeters(metersRes)
          setProofs(proofsRes)
          setSparkElec(elecDyn.dynamics)
          setSparkWater(waterDyn.dynamics)
          const pe = elecVals[0] ?? 0; const ee = elecVals.at(-1) ?? 0
          const pw = waterVals[0] ?? 0; const ew = waterVals.at(-1) ?? 0
          setElectricityDelta(pe === 0 ? 0 : Number((((ee - pe) / pe) * 100).toFixed(1)))
          setWaterDelta(pw === 0 ? 0 : Number((((ew - pw) / pw) * 100).toFixed(1)))
        } else {
          const [housesRes, summaryRes, alertsRes, metersRes, proofsRes, elecDyn, waterDyn] = await Promise.all([
            apiRequest<HouseItem[]>('/houses', { token: accessToken }),
            apiRequest<HouseSummary>(`/houses/${activeHouseId}/summary`, { token: accessToken }),
            apiRequest<ResourceAlert[]>(`/alerts?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<MeterItem[]>(`/meters?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<ManagerActionProof[]>(`/manager-actions/proofs?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=water&period=24h`, { token: accessToken }),
          ])
          setHouses(housesRes)
          setSummary(summaryRes)
          setAlerts(alertsRes)
          setMeters(metersRes)
          setProofs(proofsRes)
          setSparkElec(elecDyn.dynamics)
          setSparkWater(waterDyn.dynamics)
          const pe = elecDyn.dynamics[0]?.value ?? 0; const ee = elecDyn.dynamics.at(-1)?.value ?? 0
          const pw = waterDyn.dynamics[0]?.value ?? 0; const ew = waterDyn.dynamics.at(-1)?.value ?? 0
          setElectricityDelta(pe === 0 ? 0 : Number((((ee - pe) / pe) * 100).toFixed(1)))
          setWaterDelta(pw === 0 ? 0 : Number((((ew - pw) / pw) * 100).toFixed(1)))
        }
      } catch (err) {
        setPageError(err instanceof ApiError ? err.message : 'Failed to load dashboard')
      }
    }
    void load()
  }, [accessToken, activeHouseId, isResident, myApartmentId])

  const highAlerts = alerts.filter((a) => a.severity === 'high').length
  const offlineMeters = meters.filter((m) => m.signal_strength === 'offline').length
  const goodMeters = meters.filter((m) => m.signal_strength === 'good').length
  const totalUnits = houses.reduce((a, h) => a + h.units_count, 0)
  const avgOccupancy = houses.length === 0 ? 0 : Math.round(houses.reduce((a, h) => a + h.occupancy_rate, 0) / houses.length)

  const gasSpark = sparkElec.map((d) => ({ label: d.label, value: +(d.value * 0.17).toFixed(2) }))
  const heatSpark = sparkWater.map((d) => ({ label: d.label, value: +(d.value * 0.04).toFixed(2) }))

  const resourceCards = [
    { key: 'electricity' as const, value: +(summary?.total_power ?? 0).toFixed(1), delta: electricityDelta, data: sparkElec },
    { key: 'water' as const,       value: +(summary?.total_water ?? 0).toFixed(1), delta: waterDelta,       data: sparkWater },
    { key: 'gas' as const,         value: +((summary?.total_power ?? 0) * 0.17).toFixed(1), delta: 2.1,   data: gasSpark   },
    { key: 'heating' as const,     value: +((summary?.average_air ?? 0) * 0.85).toFixed(1), delta: -1.4,  data: heatSpark  },
  ]

  return (
    <AppShell
      title='Overview'
      subtitle={isResident && apartmentNumber ? `Apartment #${apartmentNumber}` : 'Real-time resource monitoring'}
    >
      {pageError && (
        <div className='mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
          {pageError}
        </div>
      )}

      <div className='flex min-h-[calc(100vh-170px)] flex-col'>
      {/* ── KPI Row ── */}
      <div data-tour='dashboard-kpis' className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label={isResident ? 'My apartment' : 'Buildings'}
          value={isResident && apartmentNumber ? `#${apartmentNumber}` : houses.length}
          sub={isResident ? 'Your unit' : `${totalUnits} total apartments`}
        />
        <StatCard
          label='Active alerts'
          value={alerts.length}
          sub={`${highAlerts} critical need action`}
          trend={highAlerts > 0 ? 'up' : 'neutral'}
        />
        <StatCard
          label={isResident ? 'Eco score' : 'Avg. occupancy'}
          value={isResident && apartmentScore != null ? apartmentScore : `${avgOccupancy}%`}
          sub={isResident ? 'Your unit efficiency' : 'Across all buildings'}
          trend={isResident && apartmentScore != null && apartmentScore >= 70 ? 'down' : 'neutral'}
        />
        <StatCard
          label='Active meters'
          value={meters.length}
          sub={offlineMeters > 0 ? `${offlineMeters} offline · ${goodMeters} healthy` : `${goodMeters} all healthy`}
          trend={offlineMeters > 0 ? 'up' : 'neutral'}
        />
      </div>

      {/* ── Resource sparklines ── */}
      <div data-tour='dashboard-resources' className='mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {resourceCards.map((card) => (
          <SparklineCard
            key={card.key}
            resourceKey={card.key}
            value={card.value}
            unit={RESOURCE_CONFIG[card.key].unit}
            delta={card.delta}
            data={card.data}
          />
        ))}
      </div>

      {/* ── Lower grid ── */}
      <div data-tour='dashboard-panels' className='mt-5 grid flex-1 min-h-0 gap-5 lg:grid-cols-3'>

        {/* Buildings / Apartment */}
        <div className='flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-5'>
          <SectionHeader
            title={isResident ? 'My apartment' : 'Buildings'}
            count={isResident ? undefined : houses.length}
            href={isResident ? undefined : '/workspace-shell'}
          />
          <div className='flex-1 space-y-2 overflow-auto pr-1'>
            {isResident && myApartmentId && apartmentNumber ? (
              <Link
                href={`/workspace-shell/${myApartmentId}`}
                className='flex items-center justify-between rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-slate-900'>Apartment #{apartmentNumber}</p>
                  <p className='truncate text-xs text-slate-400'>View full analytics →</p>
                </div>
                <div className='text-right ml-3'>
                  <p className='text-lg font-bold text-slate-900'>{apartmentScore ?? '—'}</p>
                  <p className='text-[10px] text-slate-400'>eco score</p>
                </div>
              </Link>
            ) : (
              houses.map((house) => (
                <div key={house.id} className='flex items-center justify-between rounded-xl border border-slate-100 p-3'>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold text-slate-900'>{house.name}</p>
                    <p className='truncate text-xs text-slate-400'>{house.address}</p>
                  </div>
                  <div className='text-right ml-3 shrink-0'>
                    <p className='text-sm font-bold text-slate-900'>{house.occupancy_rate}%</p>
                    <p className='text-[10px] text-slate-400'>{house.units_count} units</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className='flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-5'>
          <SectionHeader title='Recent anomalies' count={alerts.length} href='/alerts' />
          <div className='flex-1 space-y-2 overflow-auto pr-1'>
            {alerts.length === 0 ? (
              <p className='py-6 text-center text-sm text-slate-400'>No active anomalies</p>
            ) : (
              alerts.slice(0, 5).map((alert) => {
                const sev = SEVERITY_CONFIG[alert.severity]
                const labelColor = RESOURCE_LABEL_COLOR[alert.resource]
                return (
                  <div key={alert.id} className='rounded-xl border border-slate-100 p-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <p className='text-sm font-medium text-slate-900 leading-snug'>{alert.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${sev.badge}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className='mt-1 text-xs text-slate-400'>
                      <span className={`font-medium ${labelColor}`}>{alert.resource}</span>
                      {' · '}{alert.house_name} · {alert.detected_at}
                    </p>
                  </div>
                )
              })
            )}
          </div>
          {highAlerts > 0 && (
            <div className='mt-3 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-600'>
              {highAlerts} alert{highAlerts !== 1 ? 's' : ''} need immediate attention
            </div>
          )}
        </div>

        {/* Proofs / Meters */}
        <div className='flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-5'>
          <SectionHeader
            title={isResident ? 'Verified proofs' : 'Manager actions proof'}
            count={proofs.length}
            href='/reports'
          />
          {proofs.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-1.5 py-8 text-center'>
              <p className='text-sm text-slate-400'>No proofs anchored yet</p>
              {!isResident && (
                <Link href='/reports' className='text-xs text-blue-600 hover:underline'>Anchor a report →</Link>
              )}
            </div>
          ) : (
            <div className='flex-1 space-y-2 overflow-auto pr-1'>
              {proofs.slice(0, 4).map((proof) => (
                <div key={proof.id} className='rounded-xl border border-slate-100 p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='truncate text-xs font-semibold text-slate-800'>{proof.action_type}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      proof.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                      proof.status === 'pending'   ? 'bg-amber-100 text-amber-700' :
                                                     'bg-rose-100 text-rose-700'
                    }`}>
                      {proof.status === 'confirmed' ? 'On-chain' : proof.status}
                    </span>
                  </div>
                  {proof.explorer_url && (
                    <a
                      href={proof.explorer_url}
                      target='_blank'
                      rel='noreferrer'
                      className='mt-1.5 inline-block font-mono text-[10px] text-blue-600 hover:underline'
                    >
                      {proof.tx_hash.slice(0, 16)}…
                    </a>
                  )}
                </div>
              ))}
              {proofs.length > 4 && (
                <Link href='/reports' className='block text-center text-xs text-slate-400 hover:text-blue-600 pt-1'>
                  +{proofs.length - 4} more →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Resident: eco insight strip ── */}
      {isResident && apartmentScore != null && (
        <div className='mt-5 grid gap-4 sm:grid-cols-3'>
          <div className='col-span-3 rounded-2xl border border-slate-200 bg-white p-5'>
            <SectionHeader title='Eco performance' />
            <div className='flex items-center gap-6'>
              {/* Score ring */}
              <div className='relative flex size-20 shrink-0 items-center justify-center'>
                <svg viewBox='0 0 80 80' className='absolute inset-0 -rotate-90' fill='none'>
                  <circle cx='40' cy='40' r='34' strokeWidth='7' stroke='#f1f5f9' />
                  <circle
                    cx='40' cy='40' r='34' strokeWidth='7'
                    stroke={apartmentScore >= 80 ? '#10b981' : apartmentScore >= 60 ? '#f59e0b' : '#f43f5e'}
                    strokeDasharray={`${(apartmentScore / 100) * 213.6} 213.6`}
                    strokeLinecap='round'
                  />
                </svg>
                <p className='text-xl font-bold text-slate-900'>{apartmentScore}</p>
              </div>
              <div className='flex-1 grid grid-cols-3 gap-4'>
                <div className='rounded-xl bg-slate-50 p-3'>
                  <p className='text-xs text-slate-400 mb-1'>Electricity 24h</p>
                  <p className='text-lg font-bold text-slate-900'>{(summary?.total_power ?? 0).toFixed(1)}<span className='text-xs font-normal text-slate-400 ml-1'>kWh</span></p>
                  <p className={`text-xs mt-0.5 ${electricityDelta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {electricityDelta > 0 ? '+' : ''}{electricityDelta}% vs start
                  </p>
                </div>
                <div className='rounded-xl bg-slate-50 p-3'>
                  <p className='text-xs text-slate-400 mb-1'>Water 24h</p>
                  <p className='text-lg font-bold text-slate-900'>{(summary?.total_water ?? 0).toFixed(1)}<span className='text-xs font-normal text-slate-400 ml-1'>L</span></p>
                  <p className={`text-xs mt-0.5 ${waterDelta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {waterDelta > 0 ? '+' : ''}{waterDelta}% vs start
                  </p>
                </div>
                <div className='rounded-xl bg-slate-50 p-3'>
                  <p className='text-xs text-slate-400 mb-1'>CO₂ level</p>
                  <p className='text-lg font-bold text-slate-900'>{summary?.average_air ?? 0}<span className='text-xs font-normal text-slate-400 ml-1'>ppm</span></p>
                  <p className={`text-xs mt-0.5 ${(summary?.average_air ?? 0) > 800 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {(summary?.average_air ?? 0) > 1000 ? 'Critical' : (summary?.average_air ?? 0) > 800 ? 'Elevated' : 'Normal'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppShell>
  )
}

export default DashboardPage
