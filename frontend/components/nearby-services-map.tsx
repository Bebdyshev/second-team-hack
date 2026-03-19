'use client'

import { useCallback, useState } from 'react'
import { FiMapPin, FiMaximize2, FiX } from 'react-icons/fi'

type ServiceWithCoords = {
  name: string
  service_type: string
  lat?: number | null
  lon?: number | null
  distance_m?: number | null
  address?: string | null
  maps_url?: string
  maps_2gis_url?: string | null
}

type NearbyServicesMapProps = {
  centerLat: number
  centerLon: number
  services: ServiceWithCoords[]
  buildingName?: string
  /** Search query for 2GIS (e.g. "сантехник", "электрик") - used for "Search on 2GIS" link */
  searchQuery?: string
}

export function get2gisSearchUrl(query: string, lat: number, lon: number): string {
  const q = encodeURIComponent(query)
  const domain = lat >= 41 && lat <= 56 && lon >= 46 && lon <= 88 ? '2gis.kz' : '2gis.ru'
  return `https://${domain}/search/${q}?m=${lon.toFixed(4)}/${lat.toFixed(4)}/14`
}

export function NearbyServicesMap({
  centerLat,
  centerLon,
  services,
  buildingName = 'Building',
  searchQuery = 'сантехник',
}: NearbyServicesMapProps) {
  const [expanded, setExpanded] = useState(false)
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{
    center: [number, number]
    services: ServiceWithCoords[]
    buildingLat: number
    buildingLon: number
  }> | null>(null)

  const loadMap = useCallback(() => {
    if (!MapComponent) {
      import('./leaflet-map').then((mod) => setMapComponent(() => mod.LeafletMap))
    }
  }, [MapComponent])

  const servicesWithCoords = services.filter((s) => s.lat != null && s.lon != null)

  return (
    <div className='space-y-2'>
      <div className='relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100'>
        <button
          type='button'
          onClick={() => {
            loadMap()
            setExpanded(true)
          }}
          className='flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50'
        >
          <span className='flex items-center gap-2'>
            <FiMapPin className='size-3.5 text-slate-500' />
            {servicesWithCoords.length > 0
              ? `View ${servicesWithCoords.length} service${servicesWithCoords.length !== 1 ? 's' : ''} on map`
              : `Open map at ${buildingName}`}
          </span>
          <FiMaximize2 className='size-3.5 text-slate-400' />
        </button>
        <div className='h-36 bg-slate-200'>
          <iframe
            title='Map preview'
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${centerLon - 0.008}%2C${centerLat - 0.008}%2C${centerLon + 0.008}%2C${centerLat + 0.008}&layer=mapnik&marker=${centerLat}%2C${centerLon}`}
            className='h-full w-full border-0'
            loading='lazy'
          />
        </div>
      </div>

      {expanded && (
        <>
          <div
            className='fixed inset-0 z-50 bg-black/40'
            onClick={() => setExpanded(false)}
            aria-hidden='true'
          />
          <div className='fixed inset-4 z-50 flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl sm:inset-8'>
            <div className='flex items-center justify-between border-b border-slate-200 px-4 py-3'>
              <h3 className='text-sm font-semibold text-slate-800'>Services on map</h3>
              <div className='flex items-center gap-2'>
                <a
                  href={get2gisSearchUrl(searchQuery, centerLat, centerLon)}
                  target='_blank'
                  rel='noreferrer'
                  className='rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
                >
                  Search on 2GIS
                </a>
                <button
                  type='button'
                  onClick={() => setExpanded(false)}
                  className='rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  aria-label='Close map'
                >
                  <FiX className='size-4' />
                </button>
              </div>
            </div>
            <div className='relative min-h-0 flex-1'>
              {MapComponent ? (
                <MapComponent
                  center={[centerLat, centerLon]}
                  services={servicesWithCoords}
                  buildingLat={centerLat}
                  buildingLon={centerLon}
                />
              ) : (
                <div className='flex h-full items-center justify-center text-slate-500'>Loading map…</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
