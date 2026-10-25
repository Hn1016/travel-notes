export type ItemType = 'hotel' | 'flight' | 'other'

/** Amount per currency code, e.g. { CHF: 120, EUR: 45.5 }. */
export type Totals = Record<string, number>

export interface ItemInput {
  type: ItemType
  title: string | null
  city: string | null
  start_datetime: string // local time, YYYY-MM-DDTHH:MM[:SS]
  end_datetime: string | null
  address: string | null
  lat: number | null
  lng: number | null
  origin: string | null
  origin_lat: number | null
  origin_lng: number | null
  destination: string | null
  destination_lat: number | null
  destination_lng: number | null
  flight_number: string | null
  amount: number | null
  currency: string | null
  booking_ref: string | null
  url: string | null
  notes: string | null
}

export interface Item extends ItemInput {
  id: number
  currency: string
}

export interface Stop {
  item_id: number
  item_type: ItemType
  role: 'location' | 'origin' | 'destination'
  name: string
  lat: number
  lng: number
  at: string
  via: 'start' | 'ground' | 'flight'
}

export interface JourneySegment {
  kind: 'stay' | 'flight' | 'other' | 'gap'
  start: string
  end: string | null
  nights: number
  city: string | null
  item_ids: number[]
  totals: Totals
  overlap: boolean
}

export interface CityTotal {
  city: string
  nights: number
  visits: number
  totals: Totals
}

export interface MonthTotal {
  month: string // YYYY-MM
  totals: Totals
}

export interface Summary {
  year: number | null
  years: number[]
  nights: number
  flights: number
  totals: Totals
  by_type: Record<ItemType, Totals>
  by_city: CityTotal[]
  by_month: MonthTotal[]
  journey: JourneySegment[]
  stops: Stop[]
  items_without_location: number[]
}

export interface GeocodeResult {
  name: string
  display_name: string
  lat: number
  lng: number
  city: string | null
  country: string | null
  kind: string | null // e.g. "hotel", "guest_house", "city"
}

export interface Airport {
  iata: string
  icao: string
  name: string
  city: string
  country: string
  lat: number
  lng: number
  size: string
}

export interface FlightEndpoint {
  iata: string | null
  name: string
  city: string | null
  lat: number | null
  lng: number | null
  local_time: string | null
}

export interface FlightInfo {
  flight_number: string
  airline: string | null
  departure: FlightEndpoint
  arrival: FlightEndpoint
}

export interface Features {
  flight_lookup: boolean
  hotel_search: 'google' | 'osm'
  default_currency: string
}

export interface HotelSearchResult {
  source: 'google' | 'osm'
  results: GeocodeResult[]
}

/** The selected item, and where it was picked, so the other views can follow. */
export interface Selection {
  id: number
  source: 'map' | 'list' | 'calendar'
}
