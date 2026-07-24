// src/components/planning/guided/stepTypes/MoveByPickStep.tsx
//
// Pick-anchored month step — the season step one altitude down. Season = picks
// under goals; month = MOVES under picks. Sections are this season's picks;
// under each are the month-bucket moves that thread to it, and the shelf holds
// month items serving no pick. Filing a move stamps BOTH sourceId (precise
// pick attribution) and goalId (goal roll-up) — that's what betPulse reads to
// decide whether a pick is being fed this month. Set-aside un-threads, never
// deletes. See handoff 2026-07-24 (A).
import { useMemo, useState } from 'react'
import { Plus, Check, X, RotateCcw, ChevronDown } from 'lucide-react'
import { partitionSeason, partitionMonth } from '@/lib/planning/betPulse'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'

/** What we remember about a set-aside move so "File again" can put it back. */
type Aside = { id: string; sourceId?: string; goalId?: string }

export function MoveByPickStep() {
  const { host } = useGuided()
  const [openPick, setOpenPick] = useState<string | null>(null)
  const [dragOverPick, setDragOverPick] = useState<string | null>(null)
  const [asides, setAsides] = useState<Aside[]>([])
  const [lastAside, setLastAside] = useState<string | null>(null)
  const [shelfMenu, setShelfMenu] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
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
              <button type="button" aria-label={`Add a move for "${p.title}"`}
                onClick={() => setOpenPick(p.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary-700 border border-dashed border-primary-200 rounded-md px-2 py-1 hover:bg-primary-50">
                <Plus className="w-3 h-3" /> Add a move for this month
              </button>
            )}
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

      {shelf.length > 0 && (
        <div className="rounded-2xl border border-neutral-100 bg-white/70 p-3">
          <h3 className="text-sm font-display text-neutral-800">On the shelf ({shelf.length})</h3>
          <p className="mt-0.5 mb-2 text-xs text-neutral-400">
            This month&rsquo;s items that don&rsquo;t serve any pick yet. File one under a pick — or drag it up.
            Anything that genuinely stands alone can stay here.
          </p>
          <ul className="space-y-1">
            {shelf.map((item) => (
              <li key={item.id} draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                className="relative flex items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-white px-2.5 py-1.5 text-xs cursor-grab active:cursor-grabbing">
                <span className="truncate text-neutral-700">{item.title}</span>
                <div className="relative shrink-0">
                  <button type="button" aria-label={`File "${item.title}" under a pick`}
                    onClick={() => setShelfMenu((m) => (m === item.id ? null : item.id))}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary-200 px-2 py-0.5 text-primary-700 hover:bg-primary-50">
                    File under <ChevronDown className="w-3 h-3" />
                  </button>
                  {shelfMenu === item.id && (
                    <>
                      <button aria-hidden tabIndex={-1} onClick={() => setShelfMenu(null)}
                        className="fixed inset-0 z-40 cursor-default" />
                      <div className="absolute right-0 top-full z-50 mt-1 min-w-[240px] max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                        <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">File under</p>
                        {picks.map((p) => (
                          <button key={p.id} type="button"
                            onClick={() => { thread(item.id, p); setShelfMenu(null) }}
                            className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                            {p.title}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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
