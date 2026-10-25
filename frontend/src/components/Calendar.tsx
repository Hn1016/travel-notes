import { useMemo, useState } from 'react'
import { addDays, dayKey, formatMonth, shiftMonth, todayKey } from '../lib/format'
import { cityColor, itemLabel } from '../lib/itemTypes'
import type { Item, Selection } from '../types'

interface Props {
  month: string // YYYY-MM
  onMonthChange: (month: string) => void
  items: Item[]
  selection: Selection | null
  /** Check-in day picked, waiting for the check-out click. */
  pendingStart: string | null
  onDayClick: (day: string) => void
  onItemClick: (id: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n: number) => String(n).padStart(2, '0')

/** Days of the month, padded with nulls so the grid starts on Monday. */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number)
  const leading = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const count = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = Array(leading).fill(null)
  for (let d = 1; d <= count; d++) cells.push(`${month}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)
  return cells
}

interface DayInfo {
  nights: Item[] // hotels whose night starts on this day
  flights: Item[]
  others: Item[]
}

function indexByDay(items: Item[]): Map<string, DayInfo> {
  const days = new Map<string, DayInfo>()
  const get = (day: string) => {
    let info = days.get(day)
    if (!info) days.set(day, (info = { nights: [], flights: [], others: [] }))
    return info
  }
  for (const item of items) {
    const start = dayKey(item.start_datetime)
    if (item.type === 'hotel' && item.end_datetime) {
      const end = dayKey(item.end_datetime)
      for (let day = start; day < end; day = addDays(day, 1)) get(day).nights.push(item)
    } else if (item.type === 'flight') {
      get(start).flights.push(item)
    } else if (item.type === 'other') {
      get(start).others.push(item)
    }
  }
  return days
}

export default function Calendar({ month, onMonthChange, items, selection, pendingStart, onDayClick, onItemClick }: Props) {
  const byDay = useMemo(() => indexByDay(items), [items])
  const [hover, setHover] = useState<string | null>(null)
  const today = todayKey()

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className="btn px-2.5" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <div className="text-center">
          <h2 className="font-semibold">{formatMonth(month)}</h2>
          {month !== today.slice(0, 7) && (
            <button type="button" className="btn-link text-xs" onClick={() => onMonthChange(today.slice(0, 7))}>Back to today</button>
          )}
        </div>
        <button type="button" className="btn px-2.5" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month">›</button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-400">
        {WEEKDAYS.map((d) => <div key={d} className="pb-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 border-t border-l border-slate-200" onMouseLeave={() => setHover(null)}>
        {monthCells(month).map((day, index) => {
          if (!day) return <div key={`blank-${index}`} className="border-r border-b border-slate-200 bg-slate-50/60" />
          const info = byDay.get(day)
          const inPreview = pendingStart && hover && hover > pendingStart && day >= pendingStart && day <= hover
          const isPending = day === pendingStart

          return (
            <div
              key={day}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDayClick(day)}
              onMouseEnter={() => setHover(day)}
              className={`relative h-[4.5rem] cursor-pointer border-r border-b border-slate-200 p-1 text-left transition sm:h-20 ${
                isPending ? 'bg-slate-900/10 ring-2 ring-slate-900 ring-inset' : inPreview ? 'bg-slate-200/70' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={`text-xs tabular-nums ${
                  day === today ? 'rounded-full bg-sky-600 px-1.5 font-semibold text-white' : 'text-slate-500'
                }`}>
                  {Number(day.slice(8))}
                </span>
                <span className="flex gap-0.5">
                  {info?.flights.map((f) => (
                    <button key={f.id} type="button" title={`Flight ${itemLabel(f)}`}
                      onClick={(e) => { if (!pendingStart) { e.stopPropagation(); onItemClick(f.id) } }}
                      className={`rounded text-sm leading-none ${selection?.id === f.id ? 'ring-2 ring-slate-900' : ''}`}>
                      ✈️
                    </button>
                  ))}
                  {info?.others.map((o) => (
                    <button key={o.id} type="button" title={itemLabel(o)}
                      onClick={(e) => { if (!pendingStart) { e.stopPropagation(); onItemClick(o.id) } }}
                      className={`rounded text-xs leading-none ${selection?.id === o.id ? 'ring-2 ring-slate-900' : ''}`}>
                      📌
                    </button>
                  ))}
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-1 space-y-0.5">
                {info?.nights.map((hotel) => {
                  const checkIn = dayKey(hotel.start_datetime)
                  const lastNight = addDays(dayKey(hotel.end_datetime!), -1)
                  const first = day === checkIn
                  const last = day === lastNight
                  // Label the stay on its first night and at the start of each week row.
                  const showLabel = first || index % 7 === 0 || day.endsWith('-01')
                  const selected = selection?.id === hotel.id
                  return (
                    <button
                      key={hotel.id}
                      type="button"
                      title={`${itemLabel(hotel)} (click to select)`}
                      // While choosing a check-out day, clicks go to the day instead.
                      onClick={(e) => { if (!pendingStart) { e.stopPropagation(); onItemClick(hotel.id) } }}
                      style={{ backgroundColor: cityColor(hotel.city) }}
                      className={`block h-5 truncate px-1 text-left text-[11px] leading-5 font-medium text-white ${
                        first && last ? 'mx-1 w-[calc(100%-0.5rem)] rounded-md'
                          : first ? 'ml-1 w-[calc(100%-0.25rem)] rounded-l-md'
                          : last ? 'w-[calc(100%-0.25rem)] rounded-r-md'
                          : 'w-full'
                      } ${selected ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                    >
                      {showLabel ? hotel.city : ' '}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
