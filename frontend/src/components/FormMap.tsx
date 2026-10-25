import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import { OSM_ATTRIBUTION, OSM_TILES, circleIcon } from './mapIcons'

export interface FormPoint {
  key: string
  label: string
  color: string
  lat: number
  lng: number
}

interface Props {
  points: FormPoint[]
  /** Changes whenever the map should refit to the points (not on every drag). */
  fitKey: number
  dashed?: boolean
  onMove: (key: string, lat: number, lng: number) => void
}

function Fit({ points, fitKey }: { points: FormPoint[]; fitKey: number }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14)
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [24, 24] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map])
  return null
}

/** Small preview map in the item form. Markers can be dragged to correct a location. */
export default function FormMap({ points, fitKey, dashed, onMove }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
        Search for a place to preview it here.
      </div>
    )
  }
  return (
    <div className="h-56 overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={[points[0].lat, points[0].lng]} zoom={13} className="h-full w-full">
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
        <Fit points={points} fitKey={fitKey} />
        {dashed && points.length === 2 && (
          <Polyline positions={points.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#0284c7', weight: 3, dashArray: '6 8' }} />
        )}
        {points.map((p) => (
          <Marker
            key={p.key}
            position={[p.lat, p.lng]}
            icon={circleIcon(p.color, p.label)}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng()
                onMove(p.key, Number(lat.toFixed(6)), Number(lng.toFixed(6)))
              },
            }}
          />
        ))}
      </MapContainer>
      <p className="sr-only">Drag a marker to correct its position.</p>
    </div>
  )
}
