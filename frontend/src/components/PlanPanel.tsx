import { useState } from 'react'
import { api } from '../api/client'
import { dayKey, daysBetween, formatMoney, formatShortDate, formatStayDates, pluralize } from '../lib/format'
import { TYPE_META, airportCode, itemLabel } from '../lib/itemTypes'
import type { Item, ItemInput, PlanSuggestion } from '../types'

export interface Draft {
  key: number
  reason: string | null
  entry: ItemInput
}

interface Props {
  enabled: boolean
  currency: string
  items: Item[]
  drafts: Draft[]
  summary: string | null
  onPlanned: (summary: string, drafts: Draft[]) => void
  onAdd: (draft: Draft) => Promise<void>
  onEdit: (draft: Draft) => void
  onDiscard: (key: number) => void
  onClose: () => void
}

let nextKey = 1

function toSuggestion({ entry, reason }: Draft): PlanSuggestion {
  return {
    type: entry.type,
    start_date: dayKey(entry.start_datetime),
    end_date: entry.end_datetime ? dayKey(entry.end_datetime) : null,
    city: entry.city,
    title: entry.title,
    origin_iata: entry.type === 'flight' ? airportCode(entry.origin) : null,
    destination_iata: entry.type === 'flight' ? airportCode(entry.destination) : null,
    estimated_cost: entry.amount,
    currency: entry.currency,
    reason,
  }
}

/** The existing stay a drafted stay would overlap, if any. */
function overlappingStay(entry: ItemInput, items: Item[]): Item | undefined {
  if (entry.type !== 'hotel' || !entry.end_datetime) return undefined
  const start = dayKey(entry.start_datetime)
  const end = dayKey(entry.end_datetime)
  return items.find((i) => i.type === 'hotel' && i.end_datetime
    && dayKey(i.start_datetime) < end && dayKey(i.end_datetime) > start)
}

function when(entry: ItemInput): string {
  if (entry.type === 'hotel' && entry.end_datetime) {
    const start = dayKey(entry.start_datetime)
    const end = dayKey(entry.end_datetime)
    return `${formatStayDates(start, end)} · ${pluralize(daysBetween(start, end), 'night')}`
  }
  return formatShortDate(entry.start_datetime)
}

export default function PlanPanel({ enabled, currency, items, drafts, summary, onPlanned, onAdd, onEdit, onDiscard, onClose }: Props) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const refining = drafts.length > 0

  const lastStayEnd = items.filter((i) => i.type === 'hotel' && i.end_datetime)
    .reduce((latest, i) => (dayKey(i.end_datetime!) > latest ? dayKey(i.end_datetime!) : latest), '')
  const examples = [
    lastStayEnd
      ? `10 days somewhere warm from ${formatShortDate(lastStayEnd)}, 2–3 cities`
      : 'Two weeks in Japan next month, 3 cities, mid-range hotels',
    'A long weekend city trip from Zurich, cheap flights',
  ]

  async function submit() {
    if (prompt.trim().length < 3) return setError('Describe what you want to plan.')
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api.plan(prompt.trim(), currency, refining ? drafts.map(toSuggestion) : [])
      onPlanned(result.summary, result.drafts.map((d) => ({ key: nextKey++, ...d })))
      setNotice(result.skipped ? `${pluralize(result.skipped, 'suggestion')} could not be used and were left out.` : null)
      setPrompt('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function addAll() {
    setAdding(true)
    try {
      // One after another, so a failure stops with the rest still listed.
      for (const draft of drafts) await onAdd(draft)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="card space-y-3 border-violet-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">✨ Plan with Gemini</h2>
        <button type="button" className="btn-link text-xl leading-none" onClick={onClose} aria-label="Close">×</button>
      </div>

      {!enabled ? (
        <p className="text-sm text-slate-500">
          Add a Gemini API key to <code>backend/.env</code> as <code>GEMINI_API_KEY=…</code> and restart the backend.
          You can create a key at aistudio.google.com/apikey.
        </p>
      ) : (
        <>
          <textarea
            className="input"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            placeholder={refining ? 'What should change? e.g. cheaper hotels, skip Osaka, one more night in Kyoto' : examples[0]}
          />
          {!refining && (
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => setPrompt(example)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                  {example}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={loading}>
              {loading ? 'Thinking…' : refining ? 'Change plan' : 'Suggest a plan'}
            </button>
            {refining && (
              <button type="button" className="btn" onClick={() => onPlanned('', [])} disabled={loading}>Start over</button>
            )}
            <span className="text-xs text-slate-400">
              Sends your recent and upcoming notes to Google Gemini. Prices are estimates.
            </span>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-950">{summary}</p>}
      {notice && <p className="text-xs text-slate-500">{notice}</p>}

      {drafts.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100 rounded-lg border border-dashed border-violet-300">
            {drafts.map((draft) => {
              const { entry } = draft
              const clash = overlappingStay(entry, items)
              return (
                <li key={draft.key} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <span className="pt-0.5">{TYPE_META[entry.type].icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{itemLabel(entry)}</div>
                    <div className="text-xs text-slate-500">
                      {when(entry)}
                      {entry.type === 'flight' && ' · time not set'}
                    </div>
                    {draft.reason && <div className="text-xs text-slate-500 italic">{draft.reason}</div>}
                    {clash && (
                      <div className="text-xs text-amber-700">
                        ⚠️ Overlaps your stay in {clash.city} ({formatStayDates(dayKey(clash.start_datetime), dayKey(clash.end_datetime!))})
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular-nums">
                      {entry.amount != null ? `≈ ${formatMoney(entry.amount, entry.currency ?? currency)}` : ''}
                    </span>
                    <span className="flex gap-2 text-xs">
                      <button type="button" className="font-medium text-violet-700 hover:text-violet-900" onClick={() => onAdd(draft)}>Add</button>
                      <button type="button" className="btn-link text-xs" onClick={() => onEdit(draft)}>Edit</button>
                      <button type="button" className="btn-link text-xs" onClick={() => onDiscard(draft.key)} aria-label="Discard">✕</button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Drafts show as faded bars in the calendar until you add them.</span>
            <button type="button" className="btn" onClick={addAll} disabled={adding}>
              {adding ? 'Adding…' : `Add all ${drafts.length}`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

