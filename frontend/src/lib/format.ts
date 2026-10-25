import type { Item, Totals } from '../types'

// All dates and times are local wall-clock values, so they are parsed into
// local Date objects without any timezone conversion.
function parseParts(value: string): number[] {
  return value.split(/[-T:]/).map(Number)
}

function toDate(value: string): Date {
  const [y, m, d, hh = 0, mm = 0] = parseParts(value)
  return new Date(y, m - 1, d, hh, mm)
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const shortDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 24 Oct 2026 */
export const formatDate = (value: string) => dateFormat.format(toDate(value))
/** 24 Oct */
export const formatShortDate = (value: string) => shortDateFormat.format(toDate(value))
/** Sat 24 Oct 2026 */
export const formatDayHeading = (value: string) =>
  `${weekdayFormat.format(toDate(value))} ${formatDate(value)}`
/** 14:30 */
export const formatTime = (value: string) => timeFormat.format(toDate(value))

export function formatDateRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${sameYear ? formatShortDate(start) : formatDate(start)} – ${formatDate(end)}`
}

/** "24 Oct 2026 10:00–12:30" or "24 Oct 2026 15:00 → 27 Oct 2026 11:00" */
export function formatItemWhen(item: Pick<Item, 'start_datetime' | 'end_datetime'>): string {
  const start = item.start_datetime
  const end = item.end_datetime
  const startText = `${formatDate(start)} ${formatTime(start)}`
  if (!end) return startText
  if (dayKey(start) === dayKey(end)) return `${startText}–${formatTime(end)}`
  return `${startText} → ${formatDate(end)} ${formatTime(end)}`
}

/** YYYY-MM-DD part of a date or datetime string. */
export const dayKey = (value: string) => value.slice(0, 10)

export function addDays(day: string, days: number): string {
  const [y, m, d] = parseParts(day)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function daysBetween(startDay: string, endDay: string): number {
  const [y1, m1, d1] = parseParts(startDay)
  const [y2, m2, d2] = parseParts(endDay)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Nights between check-in and check-out, or null if check-out is missing. */
export function nights(item: Pick<Item, 'start_datetime' | 'end_datetime'>): number | null {
  if (!item.end_datetime) return null
  return Math.max(0, daysBetween(dayKey(item.start_datetime), dayKey(item.end_datetime)))
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** "CHF 120.00 · EUR 45.50", or a dash when there is nothing. */
export function formatTotals(totals: Totals | undefined): string {
  const entries = Object.entries(totals ?? {})
  if (entries.length === 0) return '—'
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' · ')
}

/** Value for an <input type="datetime-local">. */
export const toInputDateTime = (value: string | null) => (value ? value.slice(0, 16) : '')

export const monthKey = (value: string) => value.slice(0, 7)

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
/** "2026-09" -> "September 2026" */
export const formatMonth = (month: string) => monthFormat.format(toDate(`${month}-01`))

export function shiftMonth(month: string, by: number): string {
  const [y, m] = parseParts(month)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Stay dates: "1 – 5 Sep 2026", across months "28 Sep – 3 Oct 2026". */
export function formatStayDates(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))} – ${formatDate(end)}`
  return formatDateRange(start, end)
}

export const pluralize = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Currency for new entries: the last one used, else the server default. */
export function preferredCurrency(fallback: string): string {
  try {
    return localStorage.getItem('currency') || fallback
  } catch {
    return fallback
  }
}

export function rememberCurrency(currency: string | null) {
  try {
    if (currency) localStorage.setItem('currency', currency)
  } catch {
    // Storage unavailable (private mode); not important.
  }
}

export function todayKey(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
