'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { FiSearch, FiSliders, FiZap } from 'react-icons/fi'

import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FLOORS, applyEcoMode, buildDataset, tickApartments } from '@/lib/apartment-sim'

const WorkspaceShellPage = () => {
  const router = useRouter()
  const [apartments, setApartments] = useState(() => buildDataset())
  const [selectedFloor, setSelectedFloor] = useState<'all' | number>('all')
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'watch' | 'alert'>('all')
  const [anomalyFilter, setAnomalyFilter] = useState<'all' | 'with_alerts' | 'stable'>('all')
  const [ecoMode, setEcoMode] = useState(false)

  const apartmentOptions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()

    return apartments.filter((apartment) => {
      if (selectedFloor !== 'all' && apartment.floor !== selectedFloor) return false
      if (statusFilter !== 'all' && apartment.status !== statusFilter) return false
      if (anomalyFilter === 'with_alerts' && apartment.anomalies.length === 0) return false
      if (anomalyFilter === 'stable' && apartment.anomalies.length > 0) return false
      if (!normalizedSearch) return true
      return apartment.number.includes(normalizedSearch) || apartment.id.toLowerCase().includes(normalizedSearch)
    })
  }, [apartments, selectedFloor, searchValue, statusFilter, anomalyFilter])

  const summary = useMemo(() => {
    const totalPower = apartments.reduce(
      (sum, apartment) => sum + apartment.electricityDaily.reduce((inner, value) => inner + value, 0),
      0,
    )
    const totalWater = apartments.reduce(
      (sum, apartment) => sum + apartment.waterDaily.reduce((inner, value) => inner + value, 0),
      0,
    )
    const averageAir = Math.round(
      apartments.reduce(
        (sum, apartment) => sum + apartment.co2Series.reduce((inner, value) => inner + value, 0) / apartment.co2Series.length,
        0,
      ) / apartments.length,
    )
    const cityImpact = Math.max(18, Math.min(84, Math.round(totalPower / 16)))
    return { totalPower, totalWater, averageAir, cityImpact }
  }, [apartments])

  useEffect(() => {
    const interval = setInterval(() => {
      setApartments((current) => tickApartments(current, ecoMode))
    }, 4000)
    return () => clearInterval(interval)
  }, [ecoMode])

  const handleEnterApartment = (apartmentId: string) => router.push(`/workspace-shell/${apartmentId}`)

  const handleEcoModeToggle = () => {
    setEcoMode((current) => {
      const nextEcoMode = !current
      setApartments((currentApartments) => applyEcoMode(currentApartments, nextEcoMode))
      return nextEcoMode
    })
  }

  const handleReset = () => {
    setSelectedFloor('all')
    setSearchValue('')
    setStatusFilter('all')
    setAnomalyFilter('all')
  }

  const hasActiveFilters =
    selectedFloor !== 'all' || searchValue !== '' || statusFilter !== 'all' || anomalyFilter !== 'all'

  // Group apartments by floor for compact display
  const floorGroups = useMemo(() => {
    const map: Record<number, typeof apartmentOptions> = {}
    for (const apt of apartmentOptions) {
      if (!map[apt.floor]) map[apt.floor] = []
      map[apt.floor].push(apt)
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([floor, apts]) => ({ floor: Number(floor), apts }))
  }, [apartmentOptions])

  return (
    <AppShell title='Building Digital Twin' subtitle='Pick an apartment to open full analytics page'>
      <section className='mx-auto w-full max-w-7xl space-y-5'>

        {/* Filter bar */}
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <div className='mb-3 flex items-center gap-2 text-sm font-medium text-slate-700'>
            <FiSliders className='size-4 text-slate-400' />
            Filters
            {hasActiveFilters && (
              <span className='ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700'>
                Active
              </span>
            )}
          </div>
          <div className='flex flex-wrap items-end gap-3'>
            {/* Search */}
            <div className='flex min-w-56 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Search apartment</span>
              <div className='relative'>
                <FiSearch className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder='e.g. 804 or apt-804'
                  className='pl-9'
                />
              </div>
            </div>

            {/* Floor */}
            <div className='flex min-w-36 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Floor</span>
              <Select
                value={String(selectedFloor)}
                onValueChange={(value) => setSelectedFloor(value === 'all' ? 'all' : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder='All floors' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All floors</SelectItem>
                  {Array.from({ length: FLOORS }, (_, index) => FLOORS - index).map((floor) => (
                    <SelectItem key={floor} value={String(floor)}>
                      Floor {floor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className='flex min-w-36 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Status</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as 'all' | 'good' | 'watch' | 'alert')}
              >
                <SelectTrigger>
                  <SelectValue placeholder='All statuses' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All statuses</SelectItem>
                  <SelectItem value='good'>
                    <span className='flex items-center gap-2'>
                      <span className='inline-block size-2 rounded-full bg-emerald-500' />
                      Good
                    </span>
                  </SelectItem>
                  <SelectItem value='watch'>
                    <span className='flex items-center gap-2'>
                      <span className='inline-block size-2 rounded-full bg-amber-400' />
                      Watch
                    </span>
                  </SelectItem>
                  <SelectItem value='alert'>
                    <span className='flex items-center gap-2'>
                      <span className='inline-block size-2 rounded-full bg-rose-500' />
                      Alert
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Anomalies */}
            <div className='flex min-w-40 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Anomalies</span>
              <Select
                value={anomalyFilter}
                onValueChange={(value) => setAnomalyFilter(value as 'all' | 'with_alerts' | 'stable')}
              >
                <SelectTrigger>
                  <SelectValue placeholder='All apartments' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All apartments</SelectItem>
                  <SelectItem value='with_alerts'>With alerts</SelectItem>
                  <SelectItem value='stable'>Stable only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className='ml-auto flex items-end gap-2'>
              <Button
                variant='outline'
                onClick={handleReset}
                disabled={!hasActiveFilters}
                className='h-9 px-3 text-xs'
              >
                Reset
              </Button>
              <Button
                onClick={handleEcoModeToggle}
                className={`h-9 px-3 text-xs ${ecoMode ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600' : ''}`}
              >
                <FiZap className='mr-1.5 size-3.5' />
                {ecoMode ? 'Eco ON' : 'Eco OFF'}
              </Button>
            </div>
          </div>
        </article>

        {/* Apartments panel */}
        <article className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <div>
              <h2 className='text-base font-semibold text-slate-900'>Apartments</h2>
              <p className='text-xs text-slate-400'>
                Showing {apartmentOptions.length} of {apartments.length} · click to open full analytics
              </p>
            </div>
            <div className='flex gap-3 text-xs text-slate-500'>
              <span className='flex items-center gap-1.5'>
                <span className='inline-block size-2.5 rounded-full bg-emerald-400' /> Good
              </span>
              <span className='flex items-center gap-1.5'>
                <span className='inline-block size-2.5 rounded-full bg-amber-400' /> Watch
              </span>
              <span className='flex items-center gap-1.5'>
                <span className='inline-block size-2.5 rounded-full bg-rose-400' /> Alert
              </span>
            </div>
          </div>

          {apartmentOptions.length === 0 ? (
            <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500'>
              No apartments found for current filters
            </div>
          ) : (
            <div className='space-y-3'>
              {floorGroups.map(({ floor, apts }) => (
                <div key={floor} className='flex items-center gap-3'>
                  {/* Floor label */}
                  <div className='w-14 shrink-0 text-right'>
                    <span className='rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500'>
                      F {floor}
                    </span>
                  </div>

                  {/* Apartment cards in one horizontal line */}
                  <div className='flex flex-1 gap-2 overflow-x-auto pb-1'>
                    {apts.map((apartment) => {
                      const statusRing =
                        apartment.status === 'good'
                          ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                          : apartment.status === 'watch'
                            ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                            : 'border-rose-300 bg-rose-50 hover:bg-rose-100'

                      const dotColor =
                        apartment.status === 'good'
                          ? 'bg-emerald-500'
                          : apartment.status === 'watch'
                            ? 'bg-amber-400'
                            : 'bg-rose-500'

                      return (
                        <button
                          key={apartment.id}
                          type='button'
                          onClick={() => handleEnterApartment(apartment.id)}
                          className={`flex min-w-[88px] shrink-0 flex-col rounded-lg border px-3 py-2 text-left transition-all hover:scale-[1.03] hover:shadow-sm active:scale-[0.98] ${statusRing}`}
                        >
                          <div className='flex items-center justify-between gap-1'>
                            <p className='text-xs font-bold text-slate-800'>#{apartment.number}</p>
                            <span className={`size-2 shrink-0 rounded-full ${dotColor}`} />
                          </div>
                          <p className='mt-0.5 text-[10px] text-slate-500'>Score {apartment.score}</p>
                          {apartment.anomalies.length > 0 && (
                            <p className='mt-0.5 text-[9px] font-medium text-rose-600'>
                              {apartment.anomalies.length} alert
                              {apartment.anomalies.length > 1 ? 's' : ''}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        {/* Building summary */}
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <h2 className='text-sm font-semibold text-slate-900'>Building summary</h2>
          <div className='mt-3 grid gap-3 sm:grid-cols-4'>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Power</p>
              <p className='text-lg font-semibold text-slate-900'>{Math.round(summary.totalPower)} kWh</p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Water</p>
              <p className='text-lg font-semibold text-slate-900'>{Math.round(summary.totalWater)} L</p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>Air quality</p>
              <p className='text-lg font-semibold text-slate-900'>{summary.averageAir} AQI</p>
            </div>
            <div className='rounded-lg bg-slate-50 p-3'>
              <p className='text-xs text-slate-500'>City impact</p>
              <p className='text-lg font-semibold text-slate-900'>{summary.cityImpact}%</p>
            </div>
          </div>
        </article>
      </section>
    </AppShell>
  )
}

export default WorkspaceShellPage
