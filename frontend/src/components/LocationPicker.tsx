import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { api } from '../api/client'
import type { Place } from '../lib/place'
import type { GeocodeResult } from '../types'

interface Props {
  label: string
  value: Place
  onChange: (place: Place) => void
  /** Called after a search result is picked, so the preview map can refit. */
  onPicked: () => void
  withAddress?: boolean
  placeholder?: string
  /** "airport" searches the offline airport list while typing; places stay available as a fallback. */
  kind?: 'place' | 'airport'
  /** Hide the place-name field when the form has its own (e.g. the hotel name). */
  hideName?: boolean
}

const parseCoord = (value: string) => (value.trim() === '' || isNaN(Number(value)) ? null : Number(value))

export default function LocationPicker({ label, value, onChange, onPicked, withAddress, placeholder, kind = 'place', hideName }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestQuery = useRef('')

  // Airport search is local and cheap, so it runs as you type.
  useEffect(() => {
    if (kind !== 'airport') return
    const q = query.trim()
    latestQuery.current = q
    if (q.length < 2) {
      setResults(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const airports = await api.airports(q)
        if (latestQuery.current !== q) return
        setResults(airports.map((a) => ({
          name: `${a.name} (${a.iata})`,
          display_name: [a.iata, [a.city, a.country].filter(Boolean).join(', ')].join(' · '),
          lat: a.lat,
          lng: a.lng,
          city: a.city,
          country: a.country,
          kind: 'airport',
        })))
      } catch (e) {
        setError((e as Error).message)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [query, kind])

  // Nominatim's policy forbids search-as-you-type, so we search on Enter / button only.
  async function search() {
    const q = query.trim() || value.name.trim()
    if (q.length < 2) return
    setSearching(true)
    setError(null)
    try {
      setResults(await api.geocode(q))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      search()
    }
  }

  function pick(result: GeocodeResult) {
    onChange({
      name: result.name,
      address: withAddress ? result.display_name : value.address,
      lat: result.lat,
      lng: result.lng,
    })
    setResults(null)
    setQuery('')
    onPicked()
  }

  const located = value.lat != null && value.lng != null

  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'Search a place or address'} />
        <button type="button" className="btn shrink-0" onClick={search} disabled={searching}>
          {searching ? 'Searching…' : kind === 'airport' ? 'Search places' : 'Search'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {results && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 text-sm">
          {results.length === 0 && (
            <li className="px-3 py-2 text-slate-400">
              {kind === 'airport' ? 'No airport found. Try the city, or “Search places”.' : 'No results. Try a different search.'}
            </li>
          )}
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => pick(r)}>
                <span className="font-medium">{r.name}</span>
                <span className="block truncate text-xs text-slate-500">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={withAddress && !hideName ? 'grid gap-2 sm:grid-cols-2' : ''}>
        {!hideName && (
          <input className="input" value={value.name} placeholder="Place name"
            onChange={(e) => onChange({ ...value, name: e.target.value })} />
        )}
        {withAddress && (
          <input className="input" value={value.address} placeholder="Address"
            onChange={(e) => onChange({ ...value, address: e.target.value })} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Lat</span>
        <input className="input w-28! py-1 text-xs" inputMode="decimal" value={value.lat ?? ''}
          onChange={(e) => onChange({ ...value, lat: parseCoord(e.target.value) })} />
        <span>Lng</span>
        <input className="input w-28! py-1 text-xs" inputMode="decimal" value={value.lng ?? ''}
          onChange={(e) => onChange({ ...value, lng: parseCoord(e.target.value) })} />
        {located ? (
          <button type="button" className="btn-link text-xs" onClick={() => onChange({ ...value, lat: null, lng: null })}>
            Clear
          </button>
        ) : (
          <span className="text-amber-700">Not on the map yet</span>
        )}
      </div>
    </fieldset>
  )
}
