import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import Calendar from './components/Calendar'
import EntryForm, { type EntryPreset } from './components/EntryForm'
import JourneyList from './components/JourneyList'
import Modal from './components/Modal'
import { CityList, CostOverview } from './components/Overview'
import TravelMap from './components/TravelMap'
import {
  addDays,
  daysBetween,
  dayKey,
  formatDate,
  formatStayDates,
  formatTotals,
  monthKey,
  pluralize,
  preferredCurrency,
  rememberCurrency,
  todayKey,
} from './lib/format'
import { TYPE_META, itemLabel } from './lib/itemTypes'
import type { Item, ItemInput, Selection, Summary } from './types'

type Tab = 'stops' | 'cities' | 'costs'
const TABS: { id: Tab; label: string }[] = [
  { id: 'stops', label: 'Stops' },
  { id: 'cities', label: 'Cities' },
  { id: 'costs', label: 'Costs' },
]

type Editor = { item: Item } | { preset: EntryPreset }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card px-4 py-3">
      <div className="label mb-0">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export default function JournalPage() {
  const [items, setItems] = useState<Item[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [defaultCurrency, setDefaultCurrency] = useState('CHF')

  const [month, setMonth] = useState(todayKey().slice(0, 7))
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [tab, setTab] = useState<Tab>('stops')

  const reload = useCallback(async () => {
    try {
      const [all, s] = await Promise.all([api.listItems(), api.getSummary(year)])
      setItems(all)
      setSummary(s)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [year])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    api.features().then((f) => setDefaultCurrency(f.default_currency)).catch(() => {})
  }, [])

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const knownCities = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of items) if (item.city) seen.set(item.city.trim().toLowerCase(), item.city.trim())
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [items])
  const selectedItem = selection ? itemsById.get(selection.id) : undefined

  function select(id: number, source: Selection['source']) {
    setSelection({ id, source })
    setPendingStart(null)
    const item = itemsById.get(id)
    // Show the item's month in the calendar when it was picked elsewhere.
    if (item && source !== 'calendar') setMonth(monthKey(item.start_datetime))
  }

  function onDayClick(day: string) {
    setSelection(null)
    if (!pendingStart || day < pendingStart) return setPendingStart(day)
    if (day === pendingStart) return setPendingStart(null)
    setPendingStart(null)
    setEditor({ preset: { type: 'hotel', startDay: pendingStart, endDay: day } })
  }

  function openNew(preset: EntryPreset) {
    setPendingStart(null)
    setEditor({ preset })
  }

  async function save(input: ItemInput) {
    const saved = editor && 'item' in editor
      ? await api.updateItem(editor.item.id, input)
      : await api.createItem(input)
    rememberCurrency(saved.currency)
    setEditor(null)
    await reload()
    setSelection({ id: saved.id, source: 'calendar' })
    setMonth(monthKey(saved.start_datetime))
  }

  async function remove(item: Item) {
    if (!confirm(`Delete ${itemLabel(item)}?`)) return
    await api.deleteItem(item.id)
    setEditor(null)
    setSelection(null)
    await reload()
  }

  const missing = summary ? items.filter((i) => summary.items_without_location.includes(i.id)) : []
  // The day after the last noted stay, a natural start for the next one.
  const nextDay = items.filter((i) => i.type === 'hotel' && i.end_datetime)
    .reduce((latest, i) => (dayKey(i.end_datetime!) > latest ? dayKey(i.end_datetime!) : latest), '') || todayKey()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Where I stayed</h1>
          {summary && summary.years.length > 0 && (
            <select className="input w-auto! py-1" value={year ?? ''} aria-label="Year"
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All time</option>
              {summary.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => openNew({ type: 'hotel', startDay: nextDay, endDay: addDays(nextDay, 3) })}>
            🏨 Add stay
          </button>
          <button className="btn" onClick={() => openNew({ type: 'flight', startDay: todayKey() })}>✈️ Add flight</button>
          <button className="btn" onClick={() => openNew({ type: 'other', startDay: todayKey() })}>📌 Other cost</button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Could not load your notes: {error}. Is the backend running?</p>}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Nights" value={summary.nights} />
          <Stat label="Cities" value={summary.by_city.length} />
          <Stat label="Flights" value={summary.flights} />
          <Stat label="Spent" value={formatTotals(summary.totals)} />
        </div>
      )}

      {/* Phone: calendar, map, lists. Desktop: calendar and lists left, map right. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
        <section className="card p-3 sm:p-4 lg:col-start-1 lg:row-start-1">
          <Calendar
            month={month}
            onMonthChange={setMonth}
            items={items}
            selection={selection}
            pendingStart={pendingStart}
            onDayClick={onDayClick}
            onItemClick={(id) => select(id, 'calendar')}
          />
          <div className="mt-3 flex min-h-10 flex-wrap items-center gap-2 text-sm">
            {pendingStart ? (
              <>
                <span>
                  <span className="font-medium">Check-in {formatDate(pendingStart)}.</span>{' '}
                  <span className="text-slate-500">Now click the check-out day.</span>
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  <button className="btn" onClick={() => openNew({ type: 'flight', startDay: pendingStart })}>✈️ Flight this day</button>
                  <button className="btn" onClick={() => openNew({ type: 'other', startDay: pendingStart })}>📌 Cost this day</button>
                  <button className="btn-link" onClick={() => setPendingStart(null)}>Cancel</button>
                </span>
              </>
            ) : selectedItem ? (
              <>
                <span className="min-w-0">
                  <span className="font-medium">{TYPE_META[selectedItem.type].icon} {itemLabel(selectedItem)}</span>
                  {selectedItem.type === 'hotel' && selectedItem.end_datetime && (
                    <span className="text-slate-500">
                      {' '}· {formatStayDates(dayKey(selectedItem.start_datetime), dayKey(selectedItem.end_datetime))}
                      {' '}· {pluralize(daysBetween(dayKey(selectedItem.start_datetime), dayKey(selectedItem.end_datetime)), 'night')}
                    </span>
                  )}
                </span>
                <span className="ml-auto flex gap-2">
                  <button className="btn" onClick={() => setEditor({ item: selectedItem })}>Edit</button>
                  <button className="btn btn-danger" onClick={() => remove(selectedItem)}>Delete</button>
                  <button className="btn-link px-1" onClick={() => setSelection(null)} aria-label="Clear selection">×</button>
                </span>
              </>
            ) : (
              <span className="text-slate-500">Click the check-in day, then the check-out day, to note a stay.</span>
            )}
          </div>
        </section>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="space-y-2 lg:sticky lg:top-6">
            <div className="card h-72 overflow-hidden sm:h-96 lg:h-[calc(100vh-3rem)]">
              {summary && <TravelMap stops={summary.stops} items={items} selection={selection} onSelect={(id) => select(id, 'map')} />}
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-amber-700">
                📍 Not on the map:{' '}
                {missing.map((item, i) => (
                  <span key={item.id}>
                    {i > 0 && ', '}
                    <button type="button" className="underline hover:text-amber-900" onClick={() => setEditor({ item })}>
                      {itemLabel(item)}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        <section className="lg:col-start-1 lg:row-start-2">
          <div className="mb-4 flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                  tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          {summary && tab === 'stops' && (
            <JourneyList journey={summary.journey} itemsById={itemsById} selection={selection}
              onSelect={(id) => select(id, 'list')} onEdit={(item) => setEditor({ item })}
              onAddStay={(start, end) => openNew({ type: 'hotel', startDay: start, endDay: end })} />
          )}
          {summary && tab === 'cities' && <CityList summary={summary} />}
          {summary && tab === 'costs' && <CostOverview summary={summary} />}
        </section>
      </div>

      {editor && (
        <Modal wide onClose={() => setEditor(null)}
          title={'item' in editor ? `Edit ${TYPE_META[editor.item.type].label.toLowerCase()}` : 'New entry'}>
          <EntryForm
            item={'item' in editor ? editor.item : undefined}
            preset={'preset' in editor ? editor.preset : undefined}
            currency={preferredCurrency(defaultCurrency)}
            knownCities={knownCities}
            onSubmit={save}
            onDelete={'item' in editor ? () => remove(editor.item) : undefined}
            onCancel={() => setEditor(null)}
          />
        </Modal>
      )}
    </div>
  )
}
