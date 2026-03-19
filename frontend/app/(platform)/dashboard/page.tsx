'use client'

import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowDownRight,
  FiArrowUpRight,
  FiDroplet,
  FiHome,
  FiThermometer,
  FiWind,
  FiZap,
} from 'react-icons/fi'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'
import { formatPercent } from '@/lib/boilerplate-data'

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

const resourceIcon: Record<ResourceKey, React.ComponentType<{ className?: string }>> = {
  electricity: FiZap,
  water: FiDroplet,
  gas: FiWind,
  heating: FiThermometer,
}

const resourceColor: Record<ResourceKey, { bg: string; text: string; bar: string; icon: string }> = {
  electricity: { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400', icon: 'bg-amber-100 text-amber-600' },
  water: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-400', icon: 'bg-blue-100 text-blue-600' },
  gas: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', icon: 'bg-orange-100 text-orange-600' },
  heating: { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-400', icon: 'bg-rose-100 text-rose-600' },
}

const severityBadge: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-amber-100 text-amber-700',
  medium: 'bg-orange-100 text-orange-700',
  high: 'bg-rose-100 text-rose-700',
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
  const [proofError, setProofError] = useState('')
  const [pageError, setPageError] = useState('')
  const activeHouseId = activeOrganizationId ?? 'house-1'
  const isResident = activeRole === 'Resident'
  const myApartmentId = user?.apartment_id

  useEffect(() => {
    const loadDashboard = async () => {
      if (!accessToken) return
      setPageError('')
      setProofError('')

      try {
        if (isResident && myApartmentId) {
          const [apartmentSummary, electricityDynamics, waterDynamics, alertsResponse, metersResponse, proofsResponse] = await Promise.all([
            apiRequest<ApartmentSummaryResponse>(`/apartments/${myApartmentId}/summary`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/apartments/${myApartmentId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/apartments/${myApartmentId}/dynamics?resource=water&period=24h`, { token: accessToken }),
            apiRequest<ResourceAlert[]>(`/alerts?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<MeterItem[]>(`/meters?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<ManagerActionProof[]>(`/manager-actions/proofs?house_id=${activeHouseId}`, { token: accessToken }),
          ])
          const elecValues = electricityDynamics.dynamics.map((d) => d.value)
          const waterValues = waterDynamics.dynamics.map((d) => d.value)
          const totalPower = elecValues.reduce((a, b) => a + b, 0)
          const totalWater = waterValues.reduce((a, b) => a + b, 0)
          setSummary({
            total_power: totalPower,
            total_water: totalWater,
            average_air: Math.round(apartmentSummary.live_snapshot.co2),
            city_impact: Math.min(84, Math.max(18, Math.round(totalPower / 16))),
            alerts_count: 0,
          })
          setApartmentNumber(apartmentSummary.apartment.number)
          setApartmentScore(apartmentSummary.apartment.score)
          setHouses([])
          setAlerts(alertsResponse)
          setMeters(metersResponse)
          setProofs(proofsResponse)
          const powerStart = elecValues[0] ?? 0
          const powerEnd = elecValues[elecValues.length - 1] ?? 0
          const waterStart = waterValues[0] ?? 0
          const waterEnd = waterValues[waterValues.length - 1] ?? 0
          const powerDelta = powerStart == 0 ? 0 : ((powerEnd - powerStart) / powerStart) * 100
          const waterDeltaValue = waterStart == 0 ? 0 : ((waterEnd - waterStart) / waterStart) * 100
          setElectricityDelta(Number(powerDelta.toFixed(1)))
          setWaterDelta(Number(waterDeltaValue.toFixed(1)))
        } else {
          const [housesResponse, summaryResponse, alertsResponse, metersResponse, proofsResponse, electricityDynamics, waterDynamics] = await Promise.all([
            apiRequest<HouseItem[]>('/houses', { token: accessToken }),
            apiRequest<HouseSummary>(`/houses/${activeHouseId}/summary`, { token: accessToken }),
            apiRequest<ResourceAlert[]>(`/alerts?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<MeterItem[]>(`/meters?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<ManagerActionProof[]>(`/manager-actions/proofs?house_id=${activeHouseId}`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
            apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=water&period=24h`, { token: accessToken }),
          ])
          setHouses(housesResponse)
          setSummary(summaryResponse)
          setApartmentNumber(null)
          setApartmentScore(null)
          setAlerts(alertsResponse)
          setMeters(metersResponse)
          setProofs(proofsResponse)
          const powerStart = electricityDynamics.dynamics[0]?.value ?? 0
          const powerEnd = electricityDynamics.dynamics[electricityDynamics.dynamics.length - 1]?.value ?? 0
          const waterStart = waterDynamics.dynamics[0]?.value ?? 0
          const waterEnd = waterDynamics.dynamics[waterDynamics.dynamics.length - 1]?.value ?? 0
          const powerDelta = powerStart == 0 ? 0 : ((powerEnd - powerStart) / powerStart) * 100
          const waterDeltaValue = waterStart == 0 ? 0 : ((waterEnd - waterStart) / waterStart) * 100
          setElectricityDelta(Number(powerDelta.toFixed(1)))
          setWaterDelta(Number(waterDeltaValue.toFixed(1)))
        }
      } catch (requestError) {
        const message = requestError instanceof ApiError ? requestError.message : 'Failed to load dashboard data'
        setPageError(message)
        setProofError(message)
      }

    }
    void loadDashboard()
  }, [accessToken, activeHouseId, isResident, myApartmentId])

  const totalUnits = houses.reduce((acc, house) => acc + house.units_count, 0)
  const averageOccupancy = houses.length == 0 ? 0 : Math.round(houses.reduce((acc, house) => acc + house.occupancy_rate, 0) / houses.length)
  const highAlerts = alerts.filter((item) => item.severity == 'high').length
  const offlineMeters = meters.filter((item) => item.signal_strength == 'offline').length

  const resourceCards = [
    {
      key: 'electricity' as const,
      label: 'Electricity',
      unit: 'kWh',
      currentValue: summary?.total_power ?? 0,
      target: Math.max(1, Math.round((summary?.total_power ?? 0) * 0.92)),
      deltaPercent: electricityDelta,
    },
    {
      key: 'water' as const,
      label: 'Water',
      unit: 'L',
      currentValue: summary?.total_water ?? 0,
      target: Math.max(1, Math.round((summary?.total_water ?? 0) * 0.94)),
      deltaPercent: waterDelta,
    },
    {
      key: 'gas' as const,
      label: 'Gas',
      unit: 'm3',
      currentValue: Math.round((summary?.total_power ?? 0) * 0.17),
      target: Math.max(1, Math.round((summary?.total_power ?? 0) * 0.15)),
      deltaPercent: 2.1,
    },
    {
      key: 'heating' as const,
      label: 'Heating',
      unit: 'Gcal',
      currentValue: Math.round((summary?.average_air ?? 0) * 0.85),
      target: Math.max(1, Math.round((summary?.average_air ?? 0) * 0.8)),
      deltaPercent: -1.4,
    },
  ]

  return (
    <AppShell
      title='Overview'
      subtitle={isResident && apartmentNumber ? `Your apartment #${apartmentNumber}` : 'Real-time resource monitoring across all buildings'}
    >
      {pageError && <p className='mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{pageError}</p>}
      {/* Top KPI row */}
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>{isResident ? 'My apartment' : 'Buildings'}</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600'>
              <FiHome className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{isResident && apartmentNumber ? `#${apartmentNumber}` : houses.length}</p>
          <p className='mt-1 text-xs text-slate-400'>{isResident ? 'Your unit' : `${totalUnits} total apartments`}</p>
        </article>

        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>Active alerts</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600'>
              <FiAlertCircle className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{alerts.length}</p>
          <p className='mt-1 text-xs text-rose-500'>{highAlerts} critical need action</p>
        </article>

        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>{isResident ? 'Eco score' : 'Avg. occupancy'}</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600'>
              <FiArrowUpRight className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{isResident && apartmentScore != null ? apartmentScore : `${averageOccupancy}%`}</p>
          <p className='mt-1 text-xs text-slate-400'>{isResident ? 'Your unit' : 'Across all buildings'}</p>
        </article>

        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-slate-500'>Active meters</p>
            <span className='flex size-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600'>
              <FiZap className='size-4' />
            </span>
          </div>
          <p className='mt-3 text-3xl font-bold text-slate-900'>{meters.length}</p>
          <p className='mt-1 text-xs text-amber-500'>{offlineMeters} offline</p>
        </article>
      </div>

      {/* Resource KPI cards */}
      <div className='mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {resourceCards.map((kpi) => {
          const Icon = resourceIcon[kpi.key]
          const color = resourceColor[kpi.key]
          const isOverTarget = kpi.currentValue > kpi.target
          const fillPct = Math.min(100, Math.round((kpi.currentValue / kpi.target) * 100))

          return (
            <article key={kpi.key} className={`rounded-xl p-5 shadow-sm ${color.bg}`}>
              <div className='flex items-center justify-between'>
                <span className={`flex size-9 items-center justify-center rounded-lg ${color.icon}`}>
                  <Icon className='size-4' />
                </span>
                <span className={`flex items-center gap-1 text-xs font-medium ${isOverTarget ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {isOverTarget ? <FiArrowUpRight className='size-3' /> : <FiArrowDownRight className='size-3' />}
                  {formatPercent(kpi.deltaPercent)}
                </span>
              </div>
              <p className={`mt-3 text-2xl font-bold ${color.text}`}>
                {kpi.currentValue.toLocaleString()}
                <span className='ml-1 text-sm font-normal opacity-70'>{kpi.unit}</span>
              </p>
              <p className='mt-0.5 text-sm font-medium text-slate-700'>{kpi.label}</p>
              <div className='mt-3'>
                <div className='flex items-center justify-between text-xs text-slate-500'>
                  <span>Target</span>
                  <span>{fillPct}%</span>
                </div>
                <div className='mt-1 h-1.5 rounded-full bg-white/60'>
                  <div
                    className={`h-full rounded-full ${color.bar} transition-all`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Lower section */}
      <div className='mt-5 grid gap-5 lg:grid-cols-2'>
        {/* Buildings list (manager) or My apartment (resident) */}
        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-semibold text-slate-900'>{isResident ? 'My apartment' : 'Buildings'}</h2>
            <span className='text-xs text-slate-400'>{isResident ? 'Your unit' : `${houses.length} total`}</span>
          </div>
          <div className='space-y-3'>
            {isResident && myApartmentId && apartmentNumber ? (
              <Link
                href={`/workspace-shell/${myApartmentId}`}
                className='flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50'
              >
                <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100'>
                  <FiHome className='size-4 text-slate-500' />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium text-slate-900'>Apartment #{apartmentNumber}</p>
                  <p className='truncate text-xs text-slate-400'>View full analytics</p>
                </div>
                <div className='text-right'>
                  <p className='text-sm font-semibold text-slate-900'>{apartmentScore ?? '—'}</p>
                  <p className='text-xs text-slate-400'>Eco score</p>
                </div>
              </Link>
            ) : (
              houses.map((house) => (
                <div key={house.id} className='flex items-center gap-3 rounded-lg border border-slate-100 p-3'>
                  <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100'>
                    <FiHome className='size-4 text-slate-500' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium text-slate-900'>{house.name}</p>
                    <p className='truncate text-xs text-slate-400'>{house.address}</p>
                  </div>
                  <div className='text-right'>
                    <p className='text-sm font-semibold text-slate-900'>{house.occupancy_rate}%</p>
                    <p className='text-xs text-slate-400'>{house.units_count} units</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {/* Recent alerts */}
        <article className='rounded-xl bg-white p-5 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-semibold text-slate-900'>Recent anomalies</h2>
            <span className='text-xs text-slate-400'>{alerts.length} active</span>
          </div>
          <div className='space-y-3'>
            {alerts.map((alert) => {
              const Icon = resourceIcon[alert.resource]
              const color = resourceColor[alert.resource]
              return (
                <div key={alert.id} className='flex items-start gap-3 rounded-lg border border-slate-100 p-3'>
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${color.icon}`}>
                    <Icon className='size-3.5' />
                  </span>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <p className='truncate text-sm font-medium text-slate-900'>{alert.title}</p>
                    </div>
                    <p className='mt-0.5 text-xs text-slate-400'>{alert.house_name} · {alert.detected_at}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge[alert.severity]}`}>
                    {alert.severity}
                  </span>
                </div>
              )
            })}
          </div>
          <div className='mt-4 flex items-center gap-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500'>
            <FiAlertTriangle className='size-3.5 text-amber-500' />
            {highAlerts} alert{highAlerts !== 1 ? 's' : ''} need immediate attention
          </div>
        </article>
      </div>

      {!isResident && (
      <div className='mt-5 rounded-xl bg-white p-5 shadow-sm'>
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='text-sm font-semibold text-slate-900'>Manager actions proof</h2>
          <span className='text-xs text-slate-400'>{proofs.length} logged</span>
        </div>
        {proofError ? (
          <p className='text-xs text-rose-600'>{proofError}</p>
        ) : proofs.length == 0 ? (
          <p className='text-xs text-slate-500'>No proved actions yet</p>
        ) : (
          <div className='grid gap-2 md:grid-cols-2'>
            {proofs.slice(0, 4).map((proof) => (
              <article key={proof.id} className='rounded-md border border-slate-200 p-3'>
                <div className='flex items-center justify-between'>
                  <p className='text-xs font-medium text-slate-800'>{proof.action_type}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      proof.status == 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : proof.status == 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {proof.status == 'confirmed' ? 'Verified on-chain' : proof.status}
                  </span>
                </div>
                {proof.explorer_url && (
                  <a href={proof.explorer_url} target='_blank' rel='noreferrer' className='mt-1 inline-block text-[11px] text-blue-600 underline'>
                    tx {proof.tx_hash.slice(0, 12)}...
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      )}
    </AppShell>
  )
}

export default DashboardPage
