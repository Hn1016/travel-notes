import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { addDays, daysBetween, dayKey, pluralize, todayKey, toInputDateTime } from '../lib/format'
import { ITEM_TYPES, TYPE_META } from '../lib/itemTypes'
import { EMPTY_PLACE, type Place } from '../lib/place'
import type { FlightInfo, GeocodeResult, Item, ItemInput, ItemType } from '../types'
import FormMap, { type FormPoint } from './FormMap'
import LocationPicker from './LocationPicker'

export interface EntryPreset {
  type: ItemType
  startDay: string
  endDay?: string
}

interface Props {
  item?: Item
  preset?: EntryPreset
  currency: string
  knownCities: string[]
  onSubmit: (input: ItemInput) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
}

interface FormState {
  type: ItemType
  city: string
  title: string
  checkIn: string // YYYY-MM-DD
  checkOut: string
  departure: string // YYYY-MM-DDTHH:MM
  arrival: string
  day: string // date of an "other" cost
  amount: string
  currency: string
  flight_number: string
  booking_ref: string
  url: string
  notes: string
  location: Place
  origin: Place
  destination: Place
}

// Hotels only show dates; these times keep the stored values sensible.
const CHECK_IN_TIME = '15:00'
const CHECK_OUT_TIME = '11:00'

function initialState(currency: string, item?: Item, preset?: EntryPreset): FormState {
  const baseDay = item ? dayKey(item.start_datetime) : (preset?.startDay ?? todayKey())
  const state: FormState = {
    type: item?.type ?? preset?.type ?? 'hotel',
    city: item?.city ?? '',
    title: item?.title ?? '',
    checkIn: baseDay,
    checkOut: preset?.endDay ?? addDays(baseDay, 1),
    departure: `${baseDay}T09:00`,
    arrival: '',
    day: baseDay,
    amount: item?.amount != null ? String(item.amount) : '',
    currency: item?.currency ?? currency,
    flight_number: item?.flight_number ?? '',
    booking_ref: item?.booking_ref ?? '',
    url: item?.url ?? '',
    notes: item?.notes ?? '',
    location: item
      ? { name: '', address: item.address ?? '', lat: item.lat, lng: item.lng }
      : EMPTY_PLACE,
    origin: item ? { name: item.origin ?? '', address: '', lat: item.origin_lat, lng: item.origin_lng } : EMPTY_PLACE,
    destination: item
      ? { name: item.destination ?? '', address: '', lat: item.destination_lat, lng: item.destination_lng }
      : EMPTY_PLACE,
  }
  if (item?.end_datetime && item.type === 'hotel') state.checkOut = dayKey(item.end_datetime)
  if (item?.type === 'flight') {
    state.departure = toInputDateTime(item.start_datetime)
    state.arrival = toInputDateTime(item.end_datetime)
  }
  return state
}

const orNull = (value: string) => value.trim() || null

// Place types (OpenStreetMap and Google) that are somewhere to stay; these are listed first.
const LODGING = new Set([
  'hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'chalet', 'resort', 'lodging', 'resort_hotel',
  'bed_and_breakfast', 'inn', 'extended_stay_hotel', 'budget_japanese_inn', 'japanese_inn', 'private_guest_room',
])

function toInput(form: FormState, amount: number | null): ItemInput {
  const base = {
    type: form.type,
    title: null as string | null,
    city: null as string | null,
    address: null as string | null,
    lat: null as number | null,
    lng: null as number | null,
    origin: null, origin_lat: null, origin_lng: null,
    destination: null, destination_lat: null, destination_lng: null,
    flight_number: null,
    amount,
    currency: orNull(form.currency.toUpperCase()),
    booking_ref: orNull(form.booking_ref),
    url: orNull(form.url),
    notes: orNull(form.notes),
  }
  const place = { address: orNull(form.location.address), lat: form.location.lat, lng: form.location.lng }
  if (form.type === 'hotel') {
    return {
      ...base, ...place,
      title: orNull(form.title),
      city: orNull(form.city),
      start_datetime: `${form.checkIn}T${CHECK_IN_TIME}`,
      end_datetime: `${form.checkOut}T${CHECK_OUT_TIME}`,
    }
  }
  if (form.type === 'flight') {
    return {
      ...base,
      start_datetime: form.departure,
      end_datetime: form.arrival || null,
      origin: orNull(form.origin.name),
      origin_lat: form.origin.lat,
      origin_lng: form.origin.lng,
      destination: orNull(form.destination.name),
      destination_lat: form.destination.lat,
      destination_lng: form.destination.lng,
      flight_number: orNull(form.flight_number.toUpperCase()),
    }
  }
  return {
    ...base, ...place,
    title: orNull(form.title),
    city: orNull(form.city),
    start_datetime: `${form.day}T12:00`,
    end_datetime: null,
  }
}

export default function EntryForm({ item, preset, currency, knownCities, onSubmit, onDelete, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(currency, item, preset))
  const [fitKey, setFitKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [lookupEnabled, setLookupEnabled] = useState<boolean | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupMessage, setLookupMessage] = useState<string | null>(null)
  const [lookupChoices, setLookupChoices] = useState<FlightInfo[]>([])

  const [hotelResults, setHotelResults] = useState<GeocodeResult[] | null>(null)
  const [hotelSource, setHotelSource] = useState<'google' | 'osm'>('osm')
  const [hotelSearching, setHotelSearching] = useState(false)
  const [hotelError, setHotelError] = useState<string | null>(null)

  useEffect(() => {
    api.features().then((f) => setLookupEnabled(f.flight_lookup)).catch(() => setLookupEnabled(false))
  }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const refit = () => setFitKey((k) => k + 1)
  const { type } = form
  const nights = daysBetween(form.checkIn, form.checkOut)

  const points: FormPoint[] = []
  const color = TYPE_META[type].color
  if (type === 'flight') {
    if (form.origin.lat != null && form.origin.lng != null)
      points.push({ key: 'origin', label: 'A', color, lat: form.origin.lat, lng: form.origin.lng })
    if (form.destination.lat != null && form.destination.lng != null)
      points.push({ key: 'destination', label: 'B', color, lat: form.destination.lat, lng: form.destination.lng })
  } else if (form.location.lat != null && form.location.lng != null) {
    points.push({ key: 'location', label: '•', color, lat: form.location.lat, lng: form.location.lng })
  }

  function applyFlight(flight: FlightInfo) {
    const place = (p: FlightInfo['departure']) => ({ name: p.name, address: '', lat: p.lat, lng: p.lng })
    setForm((f) => ({
      ...f,
      flight_number: flight.flight_number,
      departure: flight.departure.local_time ?? f.departure,
      arrival: flight.arrival.local_time ?? f.arrival,
      origin: place(flight.departure),
      destination: place(flight.arrival),
    }))
    setLookupChoices([])
    setLookupMessage(`Filled in from ${flight.airline ? `${flight.airline} ` : ''}${flight.flight_number}. Check the times.`)
    refit()
  }

  async function lookUpFlight() {
    const day = form.departure.slice(0, 10)
    if (!form.flight_number.trim() || !day) {
      setLookupMessage('Enter the flight number and the departure date first.')
      return
    }
    setLookingUp(true)
    setLookupMessage(null)
    setLookupChoices([])
    try {
      const flights = await api.lookupFlight(form.flight_number.trim(), day)
      if (flights.length === 0) setLookupMessage(`No flight ${form.flight_number} found on that date.`)
      else if (flights.length === 1) applyFlight(flights[0])
      else setLookupChoices(flights)
    } catch (e) {
      setLookupMessage((e as Error).message)
    } finally {
      setLookingUp(false)
    }
  }

  async function findHotel() {
    const name = form.title.trim()
    if (name.length < 2) return setHotelError('Type the hotel name first.')
    // Adding the city narrows the search, unless the name already contains it.
    const city = form.city.trim()
    const query = city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name
    setHotelSearching(true)
    setHotelError(null)
    try {
      const { source, results } = await api.hotels(query)
      setHotelSource(source)
      setHotelResults([...results].sort((a, b) => Number(LODGING.has(b.kind ?? '')) - Number(LODGING.has(a.kind ?? ''))))
    } catch (err) {
      setHotelError((err as Error).message)
    } finally {
      setHotelSearching(false)
    }
  }

  function pickHotel(result: GeocodeResult) {
    setForm((f) => ({
      ...f,
      title: result.name,
      city: result.city ?? f.city,
      location: { name: '', address: result.display_name, lat: result.lat, lng: result.lng },
    }))
    setHotelResults(null)
    refit()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    let amount: number | null = null
    if (form.amount.trim()) {
      amount = Number(form.amount.replace(/['’\s]/g, '').replace(',', '.'))
      if (isNaN(amount) || amount < 0) return setError('Cost must be a positive number, e.g. 120.50')
    }
    if (type === 'hotel' && nights < 1) return setError('Check-out must be at least one day after check-in.')
    if (type === 'flight' && !(form.origin.name.trim() && form.destination.name.trim())) {
      return setError('Choose the departure and arrival airports.')
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(toInput(form, amount))
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  const costFields = (
    <div className="grid grid-cols-[1fr_6rem] gap-3">
      <div>
        <label className="label" htmlFor="entry-amount">{type === 'hotel' ? 'Cost for the stay' : 'Cost'}</label>
        <input id="entry-amount" className="input tabular-nums" inputMode="decimal" value={form.amount}
          placeholder="0.00" onChange={(e) => set('amount', e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="entry-currency">Currency</label>
        <input id="entry-currency" className="input uppercase" maxLength={3} value={form.currency}
          onChange={(e) => set('currency', e.target.value)} />
      </div>
    </div>
  )

  const cityField = (required: boolean) => (
    <div>
      <label className="label" htmlFor="entry-city">City{required ? '' : ' (optional)'}</label>
      <input id="entry-city" className="input" list="known-cities" required={required} autoFocus={type === 'hotel'}
        value={form.city} placeholder="e.g. Lisbon"
        // A different city invalidates the old exact location; the server places it at the new city.
        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value, location: EMPTY_PLACE }))} />
      <datalist id="known-cities">
        {knownCities.map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  )

  const exactLocation = (
    <div className="space-y-2">
      <LocationPicker label="Exact location (optional)" value={form.location} withAddress hideName
        // Picking a hotel from the search also fills in its name if none was typed.
        onChange={(p) => setForm((f) => ({ ...f, location: p, title: f.title || (f.type === 'hotel' ? p.name : '') }))}
        onPicked={refit}
        placeholder={form.title ? `${form.title}${form.city ? `, ${form.city}` : ''}` : 'Hotel or address'} />
      <FormMap points={points} fitKey={fitKey} onMove={(_, lat, lng) => set('location', { ...form.location, lat, lng })} />
      <p className="text-xs text-slate-400">Without an exact location, it is shown at the city centre.</p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {ITEM_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => set('type', t)}
            className={`rounded-md px-2 py-1.5 text-sm font-medium transition ${
              type === t ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}>
            {TYPE_META[t].icon} {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {type === 'hotel' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {cityField(true)}
            <div>
              <label className="label" htmlFor="entry-title">Hotel (optional)</label>
              <div className="flex gap-2">
                <input id="entry-title" className="input" value={form.title} placeholder="e.g. Memmo Alfama"
                  onChange={(e) => set('title', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      findHotel()
                    }
                  }} />
                <button type="button" className="btn shrink-0 px-2.5" onClick={findHotel} disabled={hotelSearching}
                  title="Find this hotel: fills in city, address and map location">
                  {hotelSearching ? '…' : '🔎'}
                </button>
              </div>
            </div>
          </div>
          {hotelError && <p className="-mt-2 text-xs text-red-600">{hotelError}</p>}
          {hotelResults && (
            <div className="-mt-1 rounded-lg border border-slate-200 text-sm">
              {hotelResults.length === 0 ? (
                <p className="px-3 py-2 text-slate-400">
                  Not found. Try adding the street or city, or just keep the name as typed.
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {hotelResults.map((r) => (
                    <li key={`${r.lat},${r.lng}`}>
                      <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => pickHotel(r)}>
                        <span className="font-medium">{r.name}</span>
                        {r.kind && LODGING.has(r.kind) && <span className="ml-1.5 text-xs text-violet-700">🏨 {r.kind.replace(/_/g, ' ')}</span>}
                        <span className="block truncate text-xs text-slate-500">{r.display_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-xs">
                <button type="button" className="btn-link text-xs" onClick={() => setHotelResults(null)}>Close</button>
                <span className="text-slate-400">{hotelSource === 'google' ? 'Results from Google Maps' : 'Results from OpenStreetMap'}</span>
              </div>
            </div>
          )}
          {form.location.lat != null && form.location.address && (
            <p className="-mt-2 truncate text-xs text-slate-500" title={form.location.address}>📍 {form.location.address}</p>
          )}
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <div>
              <label className="label" htmlFor="entry-in">Check-in</label>
              <input id="entry-in" type="date" className="input" required value={form.checkIn}
                onChange={(e) => {
                  const checkIn = e.target.value
                  // Keep the number of nights when moving the check-in date.
                  setForm((f) => ({ ...f, checkIn, checkOut: addDays(checkIn, Math.max(1, daysBetween(f.checkIn, f.checkOut))) }))
                }} />
            </div>
            <div>
              <label className="label" htmlFor="entry-out">Check-out</label>
              <input id="entry-out" type="date" className="input" required value={form.checkOut}
                min={addDays(form.checkIn, 1)} onChange={(e) => set('checkOut', e.target.value)} />
            </div>
            <span className="pb-2 text-sm whitespace-nowrap text-slate-500">
              {nights > 0 ? pluralize(nights, 'night') : '—'}
            </span>
          </div>
          {costFields}
        </>
      )}

      {type === 'flight' && (
        <>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div>
              <label className="label" htmlFor="entry-flight-number">Flight number</label>
              <input id="entry-flight-number" className="input uppercase" value={form.flight_number} placeholder="LX2084"
                autoFocus
                onChange={(e) => set('flight_number', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && lookupEnabled) {
                    e.preventDefault()
                    lookUpFlight()
                  }
                }} />
            </div>
            <div className="flex items-end">
              {lookupEnabled ? (
                <button type="button" className="btn" onClick={lookUpFlight} disabled={lookingUp}>
                  {lookingUp ? 'Looking up…' : '🔎 Look up flight'}
                </button>
              ) : lookupEnabled === false ? (
                <p className="pb-1 text-xs text-slate-400">
                  With an AeroDataBox key in <code>backend/.env</code>, flights fill in from the number.
                </p>
              ) : null}
            </div>
          </div>
          {lookupMessage && <p className="-mt-2 text-xs text-slate-600">{lookupMessage}</p>}
          {lookupChoices.length > 0 && (
            <ul className="rounded-lg border border-slate-200 text-sm">
              {lookupChoices.map((f, i) => (
                <li key={i}>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => applyFlight(f)}>
                    {f.departure.name} → {f.arrival.name}
                    <span className="block text-xs text-slate-500">
                      {f.departure.local_time?.slice(11)} → {f.arrival.local_time?.slice(11)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="entry-dep">Departure (local time)</label>
              <input id="entry-dep" type="datetime-local" className="input" required value={form.departure}
                onChange={(e) => set('departure', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="entry-arr">Arrival (local time)</label>
              <input id="entry-arr" type="datetime-local" className="input" value={form.arrival}
                onChange={(e) => set('arrival', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <LocationPicker kind="airport" label="From" value={form.origin} onChange={(p) => set('origin', p)}
                onPicked={refit} placeholder="Airport code or city, e.g. ZRH" />
              <LocationPicker kind="airport" label="To" value={form.destination} onChange={(p) => set('destination', p)}
                onPicked={refit} placeholder="Airport code or city, e.g. LIS" />
            </div>
            <FormMap points={points} fitKey={fitKey} dashed
              onMove={(key, lat, lng) => setForm((f) => ({ ...f, [key]: { ...f[key as 'origin' | 'destination'], lat, lng } }))} />
          </div>
          {costFields}
        </>
      )}

      {type === 'other' && (
        <>
          <div>
            <label className="label" htmlFor="entry-what">What for</label>
            <input id="entry-what" className="input" required autoFocus value={form.title}
              placeholder="e.g. Train Lisbon → Porto, car rental, insurance" onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="entry-day">Date</label>
              <input id="entry-day" type="date" className="input" required value={form.day}
                onChange={(e) => set('day', e.target.value)} />
            </div>
            {cityField(false)}
          </div>
          {costFields}
        </>
      )}

      <details className="rounded-lg border border-slate-200 px-3 py-2" open={!!(item?.notes || item?.booking_ref)}>
        <summary className="cursor-pointer text-sm font-medium text-slate-600">More details</summary>
        <div className="mt-3 space-y-3">
          {type !== 'flight' && exactLocation}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="entry-ref">Booking reference</label>
              <input id="entry-ref" className="input" value={form.booking_ref} onChange={(e) => set('booking_ref', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="entry-url">Link</label>
              <input id="entry-url" type="url" className="input" value={form.url} placeholder="https://"
                onChange={(e) => set('url', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="entry-notes">Notes</label>
            <textarea id="entry-notes" className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
      </details>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        {onDelete && (
          <button type="button" className="btn btn-danger" onClick={onDelete}>Delete</button>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{item ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </form>
  )
}
