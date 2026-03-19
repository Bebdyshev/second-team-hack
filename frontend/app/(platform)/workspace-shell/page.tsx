'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '@/components/app-shell'
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

  return (
    <AppShell title='Building Digital Twin' subtitle='Pick an apartment to open full analytics page'>
      <section className='mx-auto w-full max-w-6xl space-y-5'>
        <article className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
          <div className='flex flex-wrap items-end gap-3'>
            <label className='flex min-w-36 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Floor</span>
              <select
                value={selectedFloor}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setSelectedFloor(nextValue === 'all' ? 'all' : Number(nextValue))
                }}
                className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900'
              >
                <option value='all'>All floors</option>
                {Array.from({ length: FLOORS }, (_, index) => FLOORS - index).map((floor) => (
                  <option key={floor} value={floor}>
                    Floor {floor}
                  </option>
                ))}
              </select>
            </label>

            <label className='flex min-w-48 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Search apartment</span>
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder='e.g. 804 or apt-804'
                className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400'
              />
            </label>

            <label className='flex min-w-36 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'good' | 'watch' | 'alert')}
                className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900'
              >
                <option value='all'>All statuses</option>
                <option value='good'>Good</option>
                <option value='watch'>Watch</option>
                <option value='alert'>Alert</option>
              </select>
            </label>

            <label className='flex min-w-40 flex-col gap-1'>
              <span className='text-xs text-slate-500'>Anomalies</span>
              <select
                value={anomalyFilter}
                onChange={(event) => setAnomalyFilter(event.target.value as 'all' | 'with_alerts' | 'stable')}
                className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900'
              >
                <option value='all'>All apartments</option>
                <option value='with_alerts'>With alerts</option>
                <option value='stable'>Stable only</option>
              </select>
            </label>
            <button
              type='button'
              onClick={handleEcoModeToggle}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                ecoMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-900 text-white hover:bg-black'
              }`}
            >
              {ecoMode ? 'Eco Mode ON' : 'Eco Mode OFF'}
            </button>
            <button
              type='button'
              onClick={() => {
                setSelectedFloor('all')
                setSearchValue('')
                setStatusFilter('all')
                setAnomalyFilter('all')
              }}
              className='rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
            >
              Reset
            </button>
          </div>
        </article>

        <article className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
          <div className='mb-4 text-center'>
            <h2 className='text-lg font-semibold text-slate-900'>Apartments widget</h2>
            <p className='text-xs text-slate-400'>
              Centered view · click apartment to open dedicated page
            </p>
            <p className='mt-1 text-xs text-slate-500'>
              Showing {apartmentOptions.length} of {apartments.length}
            </p>
          </div>
          <div className='mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
            {apartmentOptions.map((apartment) => {
              const tileStatusClass =
                apartment.status === 'good'
                  ? 'border-emerald-200 bg-emerald-50'
                  : apartment.status === 'watch'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-rose-200 bg-rose-50'

              return (
                <button
                  key={apartment.id}
                  type='button'
                  onClick={() => handleEnterApartment(apartment.id)}
                  className={`min-h-[84px] rounded-xl border px-3 py-2.5 text-left transition hover:scale-[1.01] ${tileStatusClass}`}
                >
                  <p className='text-sm font-semibold text-slate-900'>#{apartment.number}</p>
                  <div className='mt-1 flex items-center justify-between text-[11px] text-slate-600'>
                    <span>Eco {apartment.score}</span>
                    <span>{apartment.anomalies.length ? 'AI alert' : 'Stable'}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {apartmentOptions.length === 0 && (
            <div className='mx-auto mt-4 max-w-2xl rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500'>
              No apartments found for current filters
            </div>
          )}
        </article>

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
