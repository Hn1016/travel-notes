import type { Item, ItemInput, ItemType } from '../types'

export const ITEM_TYPES: ItemType[] = ['hotel', 'flight', 'other']

export const TYPE_META: Record<ItemType, { label: string; plural: string; icon: string; color: string }> = {
  hotel: { label: 'Stay', plural: 'Stays', icon: '🏨', color: '#7c3aed' },
  flight: { label: 'Flight', plural: 'Flights', icon: '✈️', color: '#0284c7' },
  other: { label: 'Other cost', plural: 'Other costs', icon: '📌', color: '#d97706' },
}

/** "Francisco de Sá Carneiro Airport (OPO)" -> "OPO". */
export function airportCode(name: string | null): string {
  if (!name) return '?'
  return name.match(/\(([A-Z]{3})\)$/)?.[1] ?? name
}

/** Short human label: "Lisbon · Memmo Alfama", "OPO → BCN", "Train to Porto". */
export function itemLabel(item: ItemInput | Item): string {
  if (item.type === 'hotel') return [item.city, item.title].filter(Boolean).join(' · ')
  if (item.type === 'flight') return `${airportCode(item.origin)} → ${airportCode(item.destination)}`
  return item.title ?? 'Other cost'
}

const CITY_COLORS = ['#7c3aed', '#0d9488', '#db2777', '#ea580c', '#2563eb', '#65a30d', '#c026d3', '#0891b2', '#b45309', '#4f46e5']

/** Stable color per city, so each city looks the same everywhere. */
export function cityColor(city: string | null): string {
  const key = (city ?? '').trim().toLowerCase()
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return CITY_COLORS[hash % CITY_COLORS.length]
}
