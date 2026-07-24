// src/components/planning/guided/stepTypes/MoveByPickStep.tsx
//
// Pick-anchored month step — the season step one altitude down. Season = picks
// under goals; month = MOVES under picks. Filing a move stamps BOTH sourceId
// (precise pick attribution) and goalId (goal roll-up) — that's what betPulse
// reads to decide whether a pick is being fed this month. Set-aside un-threads,
// never deletes.
//
// LAYOUT (revised after walking it on real data): the shelf comes FIRST. The
// unfiled pile is the work of this step, and burying it under eight pick cards
// made the one job invisible. Choosing a destination happens IN PLACE, full
// width, with the pick's goal underneath — the old 260px popover with its own
// scrollbar made you squint at truncated titles that all start with "Fix".
import { useMemo, useState } from 'react'
import { Plus, Check, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { partitionSeason, partitionMonth } from '@/lib/planning/betPulse'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'
import { ListSuggestions } from '../ListSuggestions'

/** What we remember about a set-aside move so "File again" can put it back. */
type Aside = { id: string; sourceId?: string; goalId?: string }

export function MoveByPickStep() {
  const { host } = useGuided()
  const [openPick, setOpenPick] = useState<string | null>(null)
  const [dragOverPick, setDragOverPick] = useState<string | null>(null)
  const [asides, setAsides] = useState<Aside[]>([])
  const [lastAside, setLastAside] = useState<string | null>(null)
  /** Which shelf item is currently choosing a pick. */
  const [filing, setFiling] = useState<string | null>(null)
  /** Which pick is currently choosing an existing item. */
  const [attachPick, setAttachPick] = useState<string | null>(null)

  const tasksById = useMemo(() => new Map(host.tasks.map((t) => [t.id, t])), [host.tasks])
  const goalName = useMemo(() => new Map(host.goals.map((g) => [g.id, g.name])), [host.goals])

  const picks = useMemo(() => partitionSeason(host.tasks).picks, [host.tasks])
  const { byPick, shelf: allShelf } = useMemo(() => partitionMonth(picks, host.tasks), [picks, host.tasks])
  // Set-aside items live in the tray for the rest of the session rather than
  // dropping straight back onto the shelf — one tap from being filed again.
  const shelf = useMemo(
    () => allShelf.filter((s) => !asides.some((a) => a.id === s.id)),
    [allShelf, asides],
  )

  const thread = (moveId: string, p: Task) =>
    host.onUpdateTask(moveId, { sourceId: p.id, goalId: p.goalId })

  const setAside = (m: Task) => {
    host.onUpdateTask(m.id, { sourceId: undefined, goalId: undefined })
    setAsides((a) => (a.some((x) => x.id === m.id) ? a : [...a, { id: m.id, sourceId: m.sourceId, goalId: m.goalId }]))
    setLastAside(m.id)
  }
  const fileAgain = (a: Aside) => {
    host.onUpdateTask(a.id, { sourceId: a.sourceId, goalId: a.goalId })
    setAsides((xs) => xs.filter((x) => x.id !== a.id))
    setLastAside((last) => (last === a.id ? null : last))
  }

  const addMove = async (p: Task, title: string) => {
    const v = title.trim()
    if (!v) return
    await host.createTaskInBucket(v, 'month', { sourceId: p.id, goalId: p.goalId })
    setOpenPick(null)
  }

  if (picks.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No picks for this season yet. Plan the season first — then this step is where each pick gets
        its month-sized move.
      </p>
    )
  }

  const fed = picks.filter((p) => (byPick.get(p.id) ?? []).length > 0).length

  return (
    <div className="space-y-4">
      {/* ── The shelf, first: this is the pile the step exists to empty. ── */}
      {shelf.length > 0 && (
        <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-3">
          <h3 className="text-sm font-display text-neutral-800">On the shelf ({shelf.length})</h3>
          <p className="mt-0.5 mb-2 text-xs text-neutral-500">
            This month&rsquo;s items that don&rsquo;t serve any pick yet. File each one under the pick it
            moves — anything that genuinely stands alone can stay here.
          </p>
          <ul className="space-y-1.5">
            {shelf.map((item) => (
              <li key={item.id} draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 cursor-grab active:cursor-grabbing">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex-1 text-sm text-neutral-800 leading-snug">{item.title}</span>
                  <button type="button" aria-label={`File "${item.title}" under a pick`}
                    onClick={() => setFiling((m) => (m === item.id ? null : item.id))}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-dashed border-primary-200 px-2 py-1 text-xs text-primary-700 hover:bg-primary-50">
                    File under {filing === item.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
                {filing === item.id && (
                  <PickChooser picks={picks} goalName={goalName}
                    onChoose={(p) => { thread(item.id, p); setFiling(null) }}
                    onCancel={() => setFiling(null)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-neutral-400">
        {fed} of {picks.length} picks have a move this month.
      </p>

      {picks.map((p) => {
        const moves = byPick.get(p.id) ?? []
        const gname = p.goalId ? goalName.get(p.goalId) : undefined
        return (
          <section key={p.id} data-pick-id={p.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverPick(p.id) }}
            onDragLeave={() => setDragOverPick((x) => (x === p.id ? null : x))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverPick(null)
              const id = e.dataTransfer.getData('text/plain')
              if (id) thread(id, p)
            }}
            className={`rounded-2xl border bg-white/70 p-3 ${dragOverPick === p.id ? 'border-primary-300 ring-2 ring-primary-300' : 'border-neutral-100'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-display text-neutral-800">{p.title}</h3>
              {moves.length === 0 && <span className="text-xs text-amber-700">nothing this month yet</span>}
            </div>
            {gname && <p className="mt-0.5 text-[11px] text-neutral-400">serves {gname}</p>}
            <ul className="mt-2 space-y-1">
              {moves.map((m) => (
                <li key={m.id}>
                  <div draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', m.id)}
                    className="flex items-center gap-2 rounded-lg bg-primary-600 text-white px-2.5 py-1 text-xs w-fit cursor-grab active:cursor-grabbing">
                    <Check className="w-3 h-3" strokeWidth={3} />
                    <span>{m.title}</span>
                    <button type="button" aria-label={`Set aside ${m.title}`}
                      onClick={() => setAside(m)}
                      className="ml-1 text-white/70 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {openPick === p.id ? (
              <InlineAdd autoFocus placeholder="What would move this pick this month?"
                onAdd={(v) => void addMove(p, v)} />
            ) : (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button type="button" aria-label={`Add a move for "${p.title}"`}
                  onClick={() => setOpenPick(p.id)}
                  className="inline-flex items-center gap-1 text-xs text-primary-700 border border-dashed border-primary-200 rounded-md px-2 py-1 hover:bg-primary-50">
                  <Plus className="w-3 h-3" /> Add a move for this month
                </button>
                {/* The reciprocal of the shelf's "File under": most months the
                    move is already written down, and retyping it is the wrong ask. */}
                {shelf.length > 0 && (
                  <button type="button" aria-label={`File an existing item under "${p.title}"`}
                    onClick={() => setAttachPick((x) => (x === p.id ? null : p.id))}
                    className="inline-flex items-center gap-1 text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-md px-2 py-1 hover:bg-neutral-50">
                    File an existing item {attachPick === p.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            )}
            {attachPick === p.id && (
              <ShelfChooser items={shelf}
                onChoose={(item) => { thread(item.id, p); setAttachPick(null) }}
                onCancel={() => setAttachPick(null)} />
            )}
            {/* AI fuel scoped to THIS pick: the pick is the above-list, its
                existing moves ride in as do-not-duplicate. Tapping a chip is
                the ONLY write path — it adds the move already threaded. */}
            <div className="mt-2">
              <ListSuggestions
                bucket="month"
                aboveItems={[p.title]}
                aboveLabel={`the season pick “${p.title}”`}
                existingItems={moves.map((m) => m.title)}
                onPick={(title) => void addMove(p, title)}
                suggestLabel="Suggest moves"
                pickCta="Tap to add it as this month’s move for this pick."
              />
            </div>
          </section>
        )
      })}

      {asides.length > 0 && (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
          <h3 className="text-xs font-medium text-neutral-500">Set aside this month</h3>
          <ul className="mt-2 space-y-1">
            {asides.map((a) => {
              const m = tasksById.get(a.id)
              if (!m) return null
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                  <span>{m.title}</span>
                  <div className="flex items-center gap-3">
                    {lastAside === a.id && (
                      <button type="button" onClick={() => fileAgain(a)}
                        className="text-neutral-400 hover:text-neutral-600 underline">Undo</button>
                    )}
                    <button type="button" aria-label={`File again ${m.title}`}
                      onClick={() => fileAgain(a)}
                      className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800">
                      <RotateCcw className="w-3 h-3" /> File again
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Choose a pick, in place. Full-width rows with the goal underneath — the
 *  picks read alike at a glance ("Fix up the living room" vs "Fix katubah"),
 *  so the goal is what tells them apart. No inner scrollbar: the page scrolls. */
function PickChooser({ picks, goalName, onChoose, onCancel }: {
  picks: Task[]
  goalName: Map<string, string>
  onChoose: (p: Task) => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50/70 p-1.5">
      <div className="flex items-center justify-between px-1.5 pb-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">File under which pick</p>
        <button type="button" onClick={onCancel}
          className="text-[11px] text-neutral-400 hover:text-neutral-600">Cancel</button>
      </div>
      <div className="space-y-0.5">
        {picks.map((p) => {
          const g = p.goalId ? goalName.get(p.goalId) : undefined
          return (
            <button key={p.id} type="button" onClick={() => onChoose(p)}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-white hover:shadow-sm transition-colors">
              <span className="block text-sm text-neutral-800 leading-snug">{p.title}</span>
              {g && <span className="block text-[11px] text-neutral-400">serves {g}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The mirror image: choose one of the unfiled month items, in place. */
function ShelfChooser({ items, onChoose, onCancel }: {
  items: Task[]
  onChoose: (t: Task) => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50/70 p-1.5">
      <div className="flex items-center justify-between px-1.5 pb-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">On the month list, serving no pick</p>
        <button type="button" onClick={onCancel}
          className="text-[11px] text-neutral-400 hover:text-neutral-600">Cancel</button>
      </div>
      <div className="space-y-0.5">
        {items.map((t) => (
          <button key={t.id} type="button" onClick={() => onChoose(t)}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-800 leading-snug hover:bg-white hover:shadow-sm transition-colors">
            {t.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function InlineAdd({ placeholder, onAdd, autoFocus }: {
  placeholder: string; onAdd: (v: string) => void; autoFocus?: boolean
}) {
  const [v, setV] = useState('')
  return (
    <div className="mt-2 flex items-center gap-2">
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(v); setV('') } }}
        className="input-base flex-1 text-sm" />
      <button type="button" onClick={() => { onAdd(v); setV('') }}
        className="btn-primary text-xs px-3 py-1.5">Add move</button>
    </div>
  )
}
