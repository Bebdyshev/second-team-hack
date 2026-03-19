'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiSearch, FiSliders, FiZap } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/context/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

type ApartmentStatus = 'good' | 'watch' | 'alert'
type BackendApartment = {
  id: string
  floor: number
  number: string
  score: number
  status: ApartmentStatus
  anomalies: string[]
  electricity_daily: number[]
  water_daily: number[]
  co2_series: number[]
}
type ApartmentItem = {
  id: string
  floor: number
  number: string
  score: number
  status: ApartmentStatus
  anomalies: string[]
}
type HouseSummary = {
  total_power: number
  total_water: number
  average_air: number
  city_impact: number
}
type DynamicsResponse = {
  dynamics: Array<{ label: string; value: number }>
}

const TrendLine = ({ points, color, unit }: { points: number[]; color: string; unit: string }) => {
  if (points.length == 0) return null

  const width = 260
  const height = 76
  const maxPoint = Math.max(...points)
  const minPoint = Math.min(...points)
  const range = maxPoint - minPoint || 1
  const polyline = points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * width
      const y = height - ((point - minPoint) / range) * (height - 8) - 4
      return `${x},${y}`
    })
    .join(' ')
  const delta = ((points[points.length - 1] - points[0]) / (points[0] || 1)) * 100
  const isUp = delta >= 0

  return (
    <div className='rounded-lg border border-slate-200 bg-white p-3'>
      <svg viewBox={`0 0 ${width} ${height}`} className='h-[76px] w-full'>
        <polyline fill='none' stroke={color} strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' points={polyline} />
      </svg>
      <div className='mt-2 flex items-center justify-between text-xs'>
        <span className='text-slate-500'>
          {Math.round(points[0])} {'->'} {Math.round(points[points.length - 1])} {unit}
        </span>
        <span className={isUp ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>
          {isUp ? '+' : ''}
          {delta.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

const WorkspaceShellPage = () => {
  const router = useRouter()
  const { accessToken, activeOrganizationId, user, activeRole } = useAuth()
  const activeHouseId = activeOrganizationId ?? 'house-1'

  // Residents: auto-redirect to their apartment (no apartment picker)
  const isResidentRedirect = Boolean(user && accessToken && activeRole === 'Resident' && user.apartment_id)
  useEffect(() => {
    if (!isResidentRedirect) return
    router.replace(`/workspace-shell/${user!.apartment_id!}`)
  }, [isResidentRedirect, user, router])

  const [apartments, setApartments] = useState<ApartmentItem[]>([])
  const [summary, setSummary] = useState({ totalPower: 0, totalWater: 0, averageAir: 0, cityImpact: 0, powerSeries: [] as number[], waterSeries: [] as number[], co2Series: [] as number[] })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFloor, setSelectedFloor] = useState<'all' | number>('all')
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'watch' | 'alert'>('all')
  const [anomalyFilter, setAnomalyFilter] = useState<'all' | 'with_alerts' | 'stable'>('all')

  const loadData = useCallback(async () => {
    if (!accessToken) return
    if (activeRole === 'Resident' && user?.apartment_id) return
    setIsLoading(true)
    setError('')
    try {
      const [summaryResponse, apartmentsResponse, powerResponse, waterResponse, co2Response] = await Promise.all([
        apiRequest<HouseSummary>(`/houses/${activeHouseId}/summary`, { token: accessToken }),
        apiRequest<BackendApartment[]>(`/houses/${activeHouseId}/apartments`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=electricity&period=24h`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=water&period=24h`, { token: accessToken }),
        apiRequest<DynamicsResponse>(`/houses/${activeHouseId}/dynamics?resource=co2&period=24h`, { token: accessToken }),
      ])

      setApartments(
        apartmentsResponse.map((item) => ({
          id: item.id,
          floor: item.floor,
          number: item.number,
          score: item.score,
          status: item.status,
          anomalies: item.anomalies,
        })),
      )
      setSummary({
        totalPower: summaryResponse.total_power,
        totalWater: summaryResponse.total_water,
        averageAir: summaryResponse.average_air,
        cityImpact: summaryResponse.city_impact,
        powerSeries: powerResponse.dynamics.map((item) => item.value),
        waterSeries: waterResponse.dynamics.map((item) => item.value),
        co2Series: co2Response.dynamics.map((item) => item.value),
      })
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Failed to load building data'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, activeHouseId, activeRole, user?.apartment_id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const apartmentOptions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()
    return apartments.filter((apartment) => {
      if (selectedFloor !== 'all' && apartment.floor !== selectedFloor) return false
      if (statusFilter !== 'all' && apartment.status !== statusFilter) return false
      if (anomalyFilter == 'with_alerts' && apartment.anomalies.length == 0) return false
      if (anomalyFilter == 'stable' && apartment.anomalies.length > 0) return false
      if (!normalizedSearch) return true
      return apartment.number.includes(normalizedSearch) || apartment.id.toLowerCase().includes(normalizedSearch)
    })
  }, [apartments, selectedFloor, searchValue, statusFilter, anomalyFilter])

  const availableFloors = useMemo(() => {
    const floors = new Set<number>()
    apartments.forEach((item) => floors.add(item.floor))
    return Array.from(floors).sort((a, b) => b - a)
  }, [apartments])

  const hasActiveFilters = selectedFloor !== 'all' || searchValue !== '' || statusFilter !== 'all' || anomalyFilter !== 'all'
  const floorGroups = useMemo(() => {
    const map: Record<number, typeof apartmentOptions> = {}
    for (const apt of apartmentOptions) {
      if (!map[apt.floor]) map[apt.floor] = []
      map[apt.floor].push(apt)
    }
    return Object.entries(map).sort(([a], [b]) => Number(b) - Number(a)).map(([floor, apts]) => ({ floor: Number(floor), apts }))
  }, [apartmentOptions])

  const handleReset = () => {
    setSelectedFloor('all')
    setSearchValue('')
    setStatusFilter('all')
    setAnomalyFilter('all')
  }

  const handleEnterApartment = (apartmentId: string) => router.push(`/workspace-shell/${apartmentId}`)

  if (isResidentRedirect) {
    return (
      <AppShell title='Building Digital Twin' subtitle='Opening your apartment'>
        <section className='mx-auto flex max-w-7xl items-center justify-center py-24'>
          <p className='text-sm text-slate-500'>Redirecting to your apartment…</p>
        </section>
      </AppShell>
    )
  }

  return (
    <AppShell title='Building Digital Twin' subtitle='Pick an apartment to open full analytics page'>
      <section className='mx-auto w-full max-w-7xl space-y-5'>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <div className='mb-4 flex items-end justify-between gap-3'>
            <div>
              <h2 className='text-sm font-semibold text-slate-900'>Building summary</h2>
              <p className='text-xs text-slate-500'>Live dynamics</p>
            </div>
          </div>
          <div className='mb-4 grid gap-3 sm:grid-cols-4'>
            <div className='rounded-lg bg-slate-50 p-3'><p className='text-xs text-slate-500'>Power</p><p className='text-lg font-semibold text-slate-900'>{Math.round(summary.totalPower)} kWh</p></div>
            <div className='rounded-lg bg-slate-50 p-3'><p className='text-xs text-slate-500'>Water</p><p className='text-lg font-semibold text-slate-900'>{Math.round(summary.totalWater)} L</p></div>
            <div className='rounded-lg bg-slate-50 p-3'><p className='text-xs text-slate-500'>Air quality</p><p className='text-lg font-semibold text-slate-900'>{summary.averageAir} AQI</p></div>
            <div className='rounded-lg bg-slate-50 p-3'><p className='text-xs text-slate-500'>City impact</p><p className='text-lg font-semibold text-slate-900'>{summary.cityImpact}%</p></div>
          </div>
          <div className='grid gap-3 lg:grid-cols-3'>
            <div><p className='mb-2 text-xs font-medium text-slate-600'>Power trend</p><TrendLine points={summary.powerSeries} color='#2563eb' unit='kWh' /></div>
            <div><p className='mb-2 text-xs font-medium text-slate-600'>Water trend</p><TrendLine points={summary.waterSeries} color='#0891b2' unit='L' /></div>
            <div><p className='mb-2 text-xs font-medium text-slate-600'>CO2 trend</p><TrendLine points={summary.co2Series} color='#0f766e' unit='ppm' /></div>
          </div>
        </article>

        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <div className='mb-3 flex items-center gap-2 text-sm font-medium text-slate-700'>
            <FiSliders className='size-4 text-slate-400' />
            Filters
            {hasActiveFilters && <span className='ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700'>Active</span>}
          </div>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='flex min-w-56 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Search apartment</span>
              <div className='relative'>
                <FiSearch className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
                <Input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder='e.g. 804 or apt-804' className='pl-9' />
              </div>
            </div>
            <div className='flex min-w-36 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Floor</span>
              <Select value={String(selectedFloor)} onValueChange={(value) => setSelectedFloor(value == 'all' ? 'all' : Number(value))}>
                <SelectTrigger><SelectValue placeholder='All floors' /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All floors</SelectItem>
                  {availableFloors.map((floor) => <SelectItem key={floor} value={String(floor)}>Floor {floor}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className='flex min-w-36 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Status</span>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'good' | 'watch' | 'alert')}>
                <SelectTrigger><SelectValue placeholder='All statuses' /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All statuses</SelectItem>
                  <SelectItem value='good'>Good</SelectItem>
                  <SelectItem value='watch'>Watch</SelectItem>
                  <SelectItem value='alert'>Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='flex min-w-40 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Anomalies</span>
              <Select value={anomalyFilter} onValueChange={(value) => setAnomalyFilter(value as 'all' | 'with_alerts' | 'stable')}>
                <SelectTrigger><SelectValue placeholder='All apartments' /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All apartments</SelectItem>
                  <SelectItem value='with_alerts'>With alerts</SelectItem>
                  <SelectItem value='stable'>Stable only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='ml-auto flex items-end gap-2'>
              <Button variant='outline' onClick={handleReset} disabled={!hasActiveFilters} className='h-9 px-3 text-xs'>Reset</Button>
              <Button onClick={() => void loadData()} disabled={isLoading} className='h-9 border-slate-900 bg-slate-900 px-3 text-xs text-white hover:bg-slate-800'>
                <FiZap className='mr-1.5 size-3.5' />
                {isLoading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </article>

        <article className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
          {error && <p className='mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>{error}</p>}
          <div className='mb-4 flex items-center justify-between'>
            <div>
              <h2 className='text-base font-semibold text-slate-900'>Apartments</h2>
              <p className='text-xs text-slate-400'>Showing {apartmentOptions.length} of {apartments.length} · click to open full analytics</p>
            </div>
          </div>
          {apartmentOptions.length == 0 ? (
            <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500'>No apartments found for current filters</div>
          ) : (
            <div className='space-y-3'>
              {floorGroups.map(({ floor, apts }) => (
                <div key={floor} className='flex items-center justify-center gap-3'>
                  <div className='w-14 shrink-0 text-right'><span className='rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500'>F {floor}</span></div>
                  <div className='flex flex-1 justify-center gap-2 overflow-x-auto overflow-y-visible py-1'>
                    {apts.map((apartment) => {
                      const statusRing = apartment.status == 'good' ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' : apartment.status == 'watch' ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-rose-300 bg-rose-50 hover:bg-rose-100'
                      const dotColor = apartment.status == 'good' ? 'bg-emerald-500' : apartment.status == 'watch' ? 'bg-amber-400' : 'bg-rose-500'
                      return (
                        <button key={apartment.id} type='button' onClick={() => handleEnterApartment(apartment.id)} className={`flex min-w-[88px] shrink-0 flex-col rounded-lg border px-3 py-2 text-left transition-all hover:shadow-sm ${statusRing}`}>
                          <div className='flex items-center justify-between gap-1'>
                            <p className='text-xs font-bold text-slate-800'>#{apartment.number}</p>
                            <span className={`size-2 shrink-0 rounded-full ${dotColor}`} />
                          </div>
                          <p className='mt-0.5 text-[10px] text-slate-500'>Score {apartment.score}</p>
                          {apartment.anomalies.length > 0 && <p className='mt-0.5 text-[9px] font-medium text-rose-600'>{apartment.anomalies.length} alert{apartment.anomalies.length > 1 ? 's' : ''}</p>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </AppShell>
  )
}

export default WorkspaceShellPage
