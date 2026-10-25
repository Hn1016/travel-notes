export interface Place {
  name: string
  address: string
  lat: number | null
  lng: number | null
}

export const EMPTY_PLACE: Place = { name: '', address: '', lat: null, lng: null }
