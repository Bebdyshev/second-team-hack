'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMapType } from 'leaflet'

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

type LeafletMapProps = {
  center: [number, number]
  services: ServiceWithCoords[]
  buildingLat: number
  buildingLon: number
}

export function LeafletMap({ center, services, buildingLat, buildingLon }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMapType | null>(null)

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return

    const init = async () => {
      const L = (await import('leaflet')).default
      if (typeof document !== 'undefined' && !document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current!).setView(center, 14)
      mapRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map)

      // Destination / your location – bright red-orange so it pops
      const buildingIcon = L.divIcon({
        className: 'custom-marker building-marker',
        html: `<div style="
          width: 26px; height: 26px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.35), 0 0 0 4px rgba(249,115,22,0.5);
        "></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })

      // Services – teal/green
      const serviceIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #0d9488;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })

      const buildingMarker = L.marker(center, { icon: buildingIcon })
        .addTo(map)
        .bindPopup(`<strong style="color:#ea580c">📍 Your location</strong>`, { autoClose: false })
      buildingMarker.openPopup()

      services.forEach((s) => {
        if (s.lat == null || s.lon == null) return
        const m = L.marker([s.lat, s.lon], { icon: serviceIcon }).addTo(map)
        const popup = `<div class="text-sm">
          <strong class="text-slate-800">${escapeHtml(s.name)}</strong>
          ${s.distance_m != null ? `<p class="text-xs text-slate-500 mt-0.5">~${s.distance_m} m</p>` : ''}
          ${s.address ? `<p class="text-xs text-slate-600 mt-1">${escapeHtml(s.address)}</p>` : ''}
          <div class="mt-2 flex gap-2">
            ${s.maps_url ? `<a href="${escapeHtml(s.maps_url)}" target="_blank" class="text-xs text-blue-600 hover:underline">Google</a>` : ''}
            ${s.maps_2gis_url ? `<a href="${escapeHtml(s.maps_2gis_url)}" target="_blank" class="text-xs text-blue-600 hover:underline">2GIS</a>` : ''}
          </div>
        </div>`
        m.bindPopup(popup)
      })

      const allPoints: [number, number][] = [
        [buildingLat, buildingLon],
        ...services.map((s): [number, number] => [s.lat!, s.lon!]),
      ]
      if (allPoints.length > 1) {
        const bounds = L.latLngBounds(allPoints)
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
      } else {
        map.setZoom(17)
      }
      setTimeout(() => buildingMarker.openPopup(), 400)
    }

    init()
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [center, services, buildingLat, buildingLon])

  return <div ref={containerRef} className='h-full min-h-[300px] w-full' />
}

function escapeHtml(s: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null
  if (div) {
    div.textContent = s
    return div.innerHTML
  }
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
