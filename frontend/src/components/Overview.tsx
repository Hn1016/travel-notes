import { formatMonth, formatTotals, pluralize } from '../lib/format'
import { ITEM_TYPES, TYPE_META, cityColor } from '../lib/itemTypes'
import type { Summary } from '../types'

export function CityList({ summary }: { summary: Summary }) {
  const max = Math.max(1, ...summary.by_city.map((c) => c.nights))
  if (summary.by_city.length === 0) return <p className="text-sm text-slate-400">No stays yet.</p>
  return (
    <ul className="card divide-y divide-slate-100">
      {summary.by_city.map((city) => (
        <li key={city.city} className="px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{city.city}</span>
            <span className="text-right tabular-nums">{formatTotals(city.totals)}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-slate-100">
              <div className="h-2 rounded-full" style={{ width: `${(city.nights / max) * 100}%`, backgroundColor: cityColor(city.city) }} />
            </div>
            <span className="w-32 shrink-0 text-right text-xs text-slate-500">
              {pluralize(city.nights, 'night')}{city.visits > 1 && `, ${city.visits} visits`}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function CostOverview({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">By type</h3>
        <ul className="card divide-y divide-slate-100">
          {ITEM_TYPES.map((type) => (
            <li key={type} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
              <span>{TYPE_META[type].icon} {TYPE_META[type].plural}</span>
              <span className="text-right font-medium tabular-nums">{formatTotals(summary.by_type[type])}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 bg-slate-50 px-4 py-2.5 text-sm font-semibold">
            <span>Total</span>
            <span className="text-right tabular-nums">{formatTotals(summary.totals)}</span>
          </li>
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">By month</h3>
        {summary.by_month.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing yet.</p>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {summary.by_month.map((m) => (
              <li key={m.month} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{formatMonth(m.month)}</span>
                <span className="text-right font-medium tabular-nums">{formatTotals(m.totals)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">
          A stay counts in its check-in month. Currencies are summed separately.
        </p>
      </section>
    </div>
  )
}
