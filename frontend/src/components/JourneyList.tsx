import { Fragment } from 'react'
import {
  formatDate,
  formatMoney,
  formatShortDate,
  formatStayDates,
  formatTime,
  formatTotals,
  pluralize,
  todayKey,
} from '../lib/format'
import { airportCode, cityColor } from '../lib/itemTypes'
import type { Item, JourneySegment, Selection } from '../types'
import { useScrollToSelected } from './useScrollToSelected'

interface Props {
  journey: JourneySegment[]
  itemsById: Map<number, Item>
  selection: Selection | null
  onSelect: (id: number) => void
  onEdit: (item: Item) => void
  onAddStay: (start: string, end: string) => void
}

const rowClass = (selected: boolean) =>
  `cursor-pointer rounded-lg border transition ${
    selected ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-300'
  }`

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-link text-xs" onClick={(e) => { e.stopPropagation(); onClick() }}>
      Edit
    </button>
  )
}

function StayRow({ segment, hotels, selection, onSelect, onEdit }: {
  segment: JourneySegment
  hotels: Item[]
  selection: Selection | null
  onSelect: (id: number) => void
  onEdit: (item: Item) => void
}) {
  const selected = hotels.some((h) => h.id === selection?.id)
  const single = hotels.length === 1 ? hotels[0] : null
  return (
    <li id={`journey-${hotels[0]?.id}`} className={`${rowClass(selected)} p-3`} onClick={() => onSelect(hotels[0].id)}>
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cityColor(segment.city) }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{segment.city}</span>
            <span className="text-sm text-slate-500">{pluralize(segment.nights, 'night')}</span>
          </div>
          <div className="text-sm text-slate-500">
            {formatStayDates(segment.start, segment.end!)}
            {single?.title && <> · {single.title}</>}
          </div>
          {segment.overlap && <div className="text-xs text-amber-700">⚠️ Overlaps the previous stay</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium tabular-nums">{formatTotals(segment.totals)}</span>
          {single && <EditButton onClick={() => onEdit(single)} />}
        </div>
      </div>
      {!single && (
        <ul className="mt-2 ml-6 space-y-1 border-l border-slate-200 pl-3">
          {hotels.map((hotel) => (
            <li key={hotel.id} id={`journey-${hotel.id}`}
              className={`flex items-baseline gap-2 text-sm ${selection?.id === hotel.id ? 'font-medium' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSelect(hotel.id) }}>
              <span className="min-w-0 flex-1 truncate">
                {hotel.title || 'Hotel'}
                <span className="text-slate-400">
                  {' '}· {formatStayDates(hotel.start_datetime.slice(0, 10), hotel.end_datetime!.slice(0, 10))}
                </span>
              </span>
              <span className="tabular-nums">{hotel.amount != null ? formatMoney(hotel.amount, hotel.currency) : ''}</span>
              <EditButton onClick={() => onEdit(hotel)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function MoveRow({ item, selected, onSelect, onEdit }: {
  item: Item
  selected: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const flight = item.type === 'flight'
  return (
    <li id={`journey-${item.id}`} className={`${rowClass(selected)} flex items-center gap-3 px-3 py-2 text-sm`} onClick={onSelect}>
      <span className="w-3 shrink-0 text-center">{flight ? '✈️' : '📌'}</span>
      <div className="min-w-0 flex-1">
        {flight ? (
          <span title={`${item.origin} → ${item.destination}`}>
            <span className="font-medium">{airportCode(item.origin)} → {airportCode(item.destination)}</span>
            <span className="text-slate-500">
              {' '}· {formatShortDate(item.start_datetime)} {formatTime(item.start_datetime)}
              {item.flight_number && ` · ${item.flight_number}`}
            </span>
          </span>
        ) : (
          <span>
            <span className="font-medium">{item.title}</span>
            <span className="text-slate-500"> · {formatShortDate(item.start_datetime)}{item.city && ` · ${item.city}`}</span>
          </span>
        )}
      </div>
      <span className="tabular-nums">{item.amount != null ? formatMoney(item.amount, item.currency) : ''}</span>
      <EditButton onClick={onEdit} />
    </li>
  )
}

function GapRow({ segment, previous, onAdd }: {
  segment: JourneySegment
  previous: Item[]
  onAdd: () => void
}) {
  // An overnight flight explains a one-night gap.
  const onPlane = previous.some(
    (i) => i.type === 'flight' && i.end_datetime && i.start_datetime.slice(0, 10) === segment.start
      && i.end_datetime.slice(0, 10) === segment.end,
  )
  return (
    <li className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
      <span className="w-3 shrink-0 text-center">{onPlane ? '🌙' : '·'}</span>
      <span className="flex-1">
        {onPlane ? 'Night on the plane' : `${pluralize(segment.nights, 'night')} without a stay`}
        <span className="text-slate-400"> · {formatStayDates(segment.start, segment.end!)}</span>
      </span>
      {!onPlane && (
        <button type="button" className="btn-link text-xs" onClick={onAdd}>+ Add stay</button>
      )}
    </li>
  )
}

export default function JourneyList({ journey, itemsById, selection, onSelect, onEdit, onAddStay }: Props) {
  useScrollToSelected(selection, 'journey')
  const today = todayKey()
  const firstUpcoming = journey.findIndex((s) => s.start >= today)

  if (journey.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nothing noted yet. Click a check-in day in the calendar, then the check-out day.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {journey.map((segment, index) => {
        const items = segment.item_ids.map((id) => itemsById.get(id)).filter((i): i is Item => !!i)
        const divider = index === firstUpcoming && index > 0 && (
          <li className="flex items-center gap-2 py-1 text-xs font-medium tracking-wide text-sky-700 uppercase">
            <span className="h-px flex-1 bg-sky-200" /> Today, {formatDate(today)} <span className="h-px flex-1 bg-sky-200" />
          </li>
        )
        let row
        if (segment.kind === 'stay') {
          row = <StayRow segment={segment} hotels={items} selection={selection} onSelect={onSelect} onEdit={onEdit} />
        } else if (segment.kind === 'gap') {
          const previous = journey.slice(Math.max(0, index - 3), index).flatMap((s) =>
            s.item_ids.map((id) => itemsById.get(id)).filter((i): i is Item => !!i))
          row = <GapRow segment={segment} previous={previous} onAdd={() => onAddStay(segment.start, segment.end!)} />
        } else if (items[0]) {
          row = <MoveRow item={items[0]} selected={selection?.id === items[0].id}
            onSelect={() => onSelect(items[0].id)} onEdit={() => onEdit(items[0])} />
        }
        return <Fragment key={`${segment.kind}-${segment.start}-${index}`}>{divider}{row}</Fragment>
      })}
    </ul>
  )
}
