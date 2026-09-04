import { useMemo, useState, useCallback } from 'react'
import { CalendarRange, ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Span, SpanInput } from '@/types/span'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { selectPlaceableSpans, selectSpanPool, spanDayCount } from '@/lib/today/spanPlacement'
import { TriageRow, applyTriageVerdict, type Verdict } from './TriageRow'

/**
 * Custom ranges on Today's controls row, beside Week and Month.
 *
 * The planning unit the week grid can't express — a three-day weekend, a
 * school break. It sits with the other pools because it IS one: somewhere to
 * look and pick from, never part of the review session (Scott, 2026-08-19).
 *
 * "Span" is the model's word and stays in the code; the UI says "Custom",
 * because nobody planning a long weekend thinks in spans (Scott, 2026-09-04).
 *
 * The trigger names the nearest range rather than the category, because the
 * whole point is to focus on THAT weekend. Creating one is inline: a range is
 * made in the moment you realise you want to plan into it, and sending that
 * through a settings page would lose the thought.
 */

interface SpanPoolDropdownProps {
  spans: Span[]
  tasks: Task[]
  viewedDate: Date
  onCreateSpan: (input: SpanInput) => Promise<Span | null>
  onDeleteSpan: (id: string) => void | Promise<void>
  onUpdateTask: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  onDeleteTask?: (id: string) => void
  onCompleteTask?: (id: string) => void
  /** Adds a task straight onto the selected span. */
  onAddToSpan?: (title: string, spanId: string) => void | Promise<void>
}

const OFFER: Verdict[] = ['today', 'tomorrow', 'week', 'someday', 'deleted']

/** "Sat 5 – Mon 7 · 3 days" — the shape of the span, in one line. */
function describe(span: Span): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const days = spanDayCount(span)
  return `${fmt(span.startDate)} – ${fmt(span.endDate)} · ${days} day${days === 1 ? '' : 's'}`
}

export function SpanPoolDropdown({
  spans, tasks, viewedDate, onCreateSpan, onDeleteSpan,
  onUpdateTask, onPushTask, onDeleteTask, onCompleteTask, onAddToSpan,
}: SpanPoolDropdownProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(() => new Map())

  // Spans that have already ended are not destinations — placing work into
  // last weekend is the span version of a stale week placement.
  const placeable = useMemo(() => selectPlaceableSpans(spans, viewedDate), [spans, viewedDate])
  const selected = useMemo(
    () => placeable.find((s) => s.id === selectedId) ?? placeable[0] ?? null,
    [placeable, selectedId],
  )
  const pool = useMemo(() => (selected ? selectSpanPool(tasks, selected) : []), [tasks, selected])

  const close = useCallback(() => {
    setOpen(false)
    setCreating(false)
    setVerdicts(new Map())
  }, [])

  const onVerdict = (t: Task, v: Verdict) => {
    void (async () => {
      const ok = await applyTriageVerdict(t, v, { viewedDate, onUpdateTask, onPushTask, onDeleteTask })
      if (ok) setVerdicts((prev) => new Map(prev).set(t.id, v))
    })()
  }

  const onComplete = onCompleteTask
    ? (t: Task) => {
        onCompleteTask(t.id)
        setVerdicts((prev) => new Map(prev).set(t.id, 'completed' as Verdict))
      }
    : undefined

  const label = selected ? selected.name : 'Custom'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={selected ? `${selected.name} pool` : 'Custom range'}
        title={selected ? `${selected.name} — ${describe(selected)}` : 'Plan your own stretch of days — a long weekend, a school break'}
        className="flex max-w-[15rem] items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={close} className="fixed inset-0 z-40 cursor-default" />
          <div className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-[440px] max-w-[90vw] overflow-auto rounded-xl border border-neutral-300 bg-white p-2 shadow-xl ring-1 ring-neutral-900/5">
            {placeable.length > 1 && (
              <div className="mb-1.5 flex flex-wrap gap-1 border-b border-neutral-100 pb-1.5">
                {placeable.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-lg px-2 py-1 text-xs transition-colors ${
                      s.id === selected?.id
                        ? 'bg-primary-50 font-semibold text-primary-700'
                        : 'text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
                <p className="truncate text-xs text-neutral-400">{describe(selected)}</p>
                <button
                  type="button"
                  onClick={() => { void onDeleteSpan(selected.id); setSelectedId(null) }}
                  aria-label={`Delete ${selected.name}`}
                  title="Delete this range — anything planned into it goes back to the inbox"
                  className="rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {selected && (pool.length === 0
              ? <p className="px-2 py-1.5 text-sm text-neutral-400">Nothing planned into it yet.</p>
              : (
                <ul className="space-y-1.5">
                  {pool.map((t) => (
                    <TriageRow key={t.id} task={t} offer={OFFER}
                      verdict={verdicts.get(t.id)} canDelete={!!onDeleteTask}
                      onVerdict={onVerdict} onComplete={onComplete} />
                  ))}
                </ul>
              ))}

            {/* Planning INTO the span is the whole point, so the way to do it
                sits with the pool rather than behind a triage verb. */}
            {selected && onAddToSpan && (
              <form
                className="mt-1.5 flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!draft.trim()) return
                  void onAddToSpan(draft, selected.id)
                  setDraft('')
                }}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Add to ${selected.name}…`}
                  aria-label={`Add to ${selected.name}`}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-neutral-50 px-2 py-1.5 text-sm transition-colors focus:border-neutral-200 focus:bg-white focus:outline-none"
                />
              </form>
            )}

            {creating ? (
              <SpanCreateForm
                viewedDate={viewedDate}
                onCancel={() => setCreating(false)}
                onCreate={async (input) => {
                  const made = await onCreateSpan(input)
                  if (made) setSelectedId(made.id)
                  setCreating(false)
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
              >
                <Plus className="h-3.5 w-3.5" />
                New custom range
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Name, first day, last day. Both ends inclusive, which is how a person says
 * "Saturday to Monday" — and the default is exactly that: the coming weekend
 * plus the Monday, because that is the case this exists for.
 */
function SpanCreateForm({
  viewedDate, onCreate, onCancel,
}: {
  viewedDate: Date
  onCreate: (input: SpanInput) => void | Promise<void>
  onCancel: () => void
}) {
  const defaults = useMemo(() => {
    const d = new Date(viewedDate); d.setHours(0, 0, 0, 0)
    // Next Saturday (or today, if today is one), through the Monday after it.
    const toSaturday = (6 - d.getDay() + 7) % 7
    const start = new Date(d); start.setDate(d.getDate() + toSaturday)
    const end = new Date(start); end.setDate(start.getDate() + 2)
    return { start: localYmd(start), end: localYmd(end) }
  }, [viewedDate])

  const [name, setName] = useState('')
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)

  const invalid = !name.trim() || end < start

  return (
    <form
      className="mt-1.5 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (invalid) return
        void onCreate({ name: name.trim(), startDate: parseLocalYmd(start), endDate: parseLocalYmd(end), context: 'family' })
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Labor Day weekend"
        aria-label="Span name"
        className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <label className="flex-1 text-[11px] text-neutral-500">
          First day
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" />
        </label>
        <label className="flex-1 text-[11px] text-neutral-500">
          Last day
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm" />
        </label>
      </div>
      {end < start && <p className="text-[11px] text-amber-700">The last day is before the first.</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel}
          className="rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">Cancel</button>
        <button type="submit" disabled={invalid}
          className="rounded-lg bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">Create</button>
      </div>
    </form>
  )
}
