import type {
  Airport,
  Features,
  FlightInfo,
  GeocodeResult,
  HotelSearchResult,
  Item,
  ItemInput,
  Summary,
} from '../types'

interface ValidationError {
  loc: (string | number)[]
  msg: string
}

function describeError(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return (detail as ValidationError[])
      .map((e) => {
        const field = e.loc.filter((part) => part !== 'body').join('.')
        const message = e.msg.replace(/^Value error, /, '')
        return field ? `${field}: ${message}` : message
      })
      .join('; ')
  }
  return null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      message = describeError((await response.json()).detail) ?? message
    } catch {
      // Body was not JSON; keep the status text.
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
})

let featuresRequest: Promise<Features> | undefined

export const api = {
  listItems: () => request<Item[]>('/items'),
  createItem: (input: ItemInput) => request<Item>('/items', json('POST', input)),
  updateItem: (id: number, input: ItemInput) => request<Item>(`/items/${id}`, json('PUT', input)),
  deleteItem: (id: number) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  getSummary: (year: number | null) => request<Summary>(`/summary${year ? `?year=${year}` : ''}`),

  geocode: (q: string) => request<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(q)}`),
  hotels: (q: string) => request<HotelSearchResult>(`/hotels?q=${encodeURIComponent(q)}`),
  airports: (q: string) => request<Airport[]>(`/airports?q=${encodeURIComponent(q)}`),
  lookupFlight: (number: string, day: string) =>
    request<FlightInfo[]>(`/flights/lookup?number=${encodeURIComponent(number)}&day=${day}`),
  features: () => (featuresRequest ??= request<Features>('/features')),
}
