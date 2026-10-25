import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { formatItemWhen, formatMoney, formatStayDates, nights, pluralize } from '../lib/format'
import { TYPE_META, cityColor, itemLabel } from '../lib/itemTypes'
import type { Item, Selection, Stop } from '../types'
import { OSM_ATTRIBUTION, OSM_TILES, circleIcon } from './mapIcons'

interface Props {
  stops: Stop[]
  items: Item[]
  selection: Selection | null
  onSelect: (id: number) => void
}

function FitToStops({ stops }: { stops: Stop[] }) {
  const map = useMap()
  const key = stops.map((s) => `${s.lat},${s.lng}`).join('|')
  useEffect(() => {
    if (stops.length === 0) map.setView([30, 10], 2)
    else if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 11)
    else map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [32, 32] })
    // Refit only when the set of coordinates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

/** Fly to the item picked in the list or calendar. */
function FollowSelection({ stops, selection }: { stops: Stop[]; selection: Selection | null }) {
  const map = useMap()
  useEffect(() => {
    if (!selection || selection.source === 'map') return
    const points = stops.filter((s) => s.item_id === selection.id)
    if (points.length === 1) {
      map.flyTo([points[0].lat, points[0].lng], Math.max(map.getZoom(), 11), { duration: 0.6 })
    } else if (points.length > 1) {
      map.flyToBounds(L.latLngBounds(points.map((s) => [s.lat, s.lng])), { padding: [48, 48], duration: 0.6 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, map])
  return null
}

function PopupBody({ item, stop }: { item: Item | undefined; stop: Stop }) {
  if (!item) return <div className="text-sm">{stop.name}</div>
  const n = item.type === 'hotel' ? nights(item) : null
  return (
    <div className="min-w-40 space-y-0.5 text-sm">
      <div className="font-semibold">{TYPE_META[item.type].icon} {itemLabel(item)}</div>
      {item.type === 'hotel' && item.end_datetime ? (
        <div>
          {formatStayDates(item.start_datetime.slice(0, 10), item.end_datetime.slice(0, 10))}
          {n != null && <span className="text-slate-500"> · {pluralize(n, 'night')}</span>}
        </div>
      ) : (
        <>
          {item.type === 'flight' && <div className="text-slate-500">{stop.role === 'origin' ? 'Departure' : 'Arrival'}: {stop.name}</div>}
          <div>{formatItemWhen(item)}</div>
        </>
      )}
      {item.amount != null && <div className="font-medium">{formatMoney(item.amount, item.currency)}</div>}
    </div>
  )
}

function StopMarker({ stop, index, item, selected, openPopupFor, onSelect }: {
  stop: Stop
  index: number
  item: Item | undefined
  selected: boolean
  openPopupFor: Selection | null
  onSelect: () => void
}) {
  const ref = useRef<L.Marker>(null)
  const color = stop.item_type === 'hotel' ? cityColor(item?.city ?? stop.name) : TYPE_META[stop.item_type].color
  const icon = useMemo(() => circleIcon(color, String(index + 1), selected), [color, index, selected])

  useEffect(() => {
    if (!openPopupFor) return
    // Open after the fly animation, so the popup does not interrupt it.
    const timer = setTimeout(() => ref.current?.openPopup(), 650)
    return () => clearTimeout(timer)
  }, [openPopupFor])

  return (
    <Marker ref={ref} position={[stop.lat, stop.lng]} icon={icon} zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{ click: onSelect }}>
      <Popup><PopupBody item={item} stop={stop} /></Popup>
    </Marker>
  )
}

export default function TravelMap({ stops, items, selection, onSelect }: Props) {
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  return (
    <MapContainer center={[30, 10]} zoom={2} className="h-full w-full" scrollWheelZoom worldCopyJump>
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      <FitToStops stops={stops} />
      <FollowSelection stops={stops} selection={selection} />

      {stops.slice(1).map((stop, i) => {
        const prev = stops[i]
        const flight = stop.via === 'flight'
        return (
          <Polyline
            key={`${i}-${stop.via}`}
            positions={[[prev.lat, prev.lng], [stop.lat, stop.lng]]}
            pathOptions={{
              color: flight ? TYPE_META.flight.color : '#475569',
              weight: flight ? 2.5 : 3,
              opacity: 0.75,
              dashArray: flight ? '6 8' : undefined,
            }}
          />
        )
      })}

      {stops.map((stop, index) => {
        const selected = selection?.id === stop.item_id
        // For flights only the departure marker opens its popup.
        const firstOfItem = stops.findIndex((s) => s.item_id === stop.item_id) === index
        return (
          <StopMarker
            key={`${stop.item_id}-${stop.role}`}
            stop={stop}
            index={index}
            item={itemsById.get(stop.item_id)}
            selected={selected}
            openPopupFor={selected && firstOfItem && selection?.source !== 'map' ? selection : null}
            onSelect={() => onSelect(stop.item_id)}
          />
        )
      })}
    </MapContainer>
  )
}
