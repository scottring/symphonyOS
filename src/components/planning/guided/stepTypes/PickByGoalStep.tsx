// src/components/planning/guided/stepTypes/PickByGoalStep.tsx
//
// Goal-anchored season picker. Walks the current-domain goals; under each you
// add the pick(s) that move it this season — created already threaded
// (goal_id + picked_at at insert). host.goals/host.tasks are already
// domain-filtered by the container. This is render + add only; drag re-parent,
// set-aside, coherence hint, and AI-suggest come in later tasks. See spec
// 2026-07-24.
import { useMemo, useState } from 'react'
import { Plus, Check, X, RotateCcw, ChevronDown } from 'lucide-react'
import { partitionSeason, PICK_CAP } from '@/lib/planning/betPulse'
import { goalsInFocusNudge, coherenceHint } from '@/lib/planning/pickCoherence'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'
import { ListSuggestions } from '../ListSuggestions'

export function PickByGoalStep() {
  const { host, step } = useGuided()
  const standalone = !!step.props?.standalone
  const [openGoal, setOpenGoal] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [dragOverGoal, setDragOverGoal] = useState<string | null>(null)
  // Set-aside is recoverable: demoted picks stay listed in a session tray so
  // they're one tap from being picked again. Order is chronological; the last
  // one also gets an inline Undo.
  const [setAsideIds, setSetAsideIds] = useState<string[]>([])
  const [lastSetAside, setLastSetAside] = useState<string | null>(null)
  // Which shelf item's "File under" menu is open (only one at a time).
  const [shelfMenu, setShelfMenu] = useState<string | null>(null)

  const tasksById = useMemo(() => new Map(host.tasks.map((t) => [t.id, t])), [host.tasks])

  // Recoverable remove: demote (pickedAt: null), NEVER delete.
  const setAside = (id: string) => {
    host.onUpdateTask(id, { pickedAt: null })
    setSetAsideIds((s) => (s.includes(id) ? s : [...s, id]))
    setLastSetAside(id)
  }
  const pickAgain = (id: string) => {
    host.onUpdateTask(id, { pickedAt: new Date() })
    setSetAsideIds((s) => s.filter((x) => x !== id))
    setLastSetAside((last) => (last === id ? null : last))
  }

  const season = useMemo(() => partitionSeason(host.tasks), [host.tasks])
  const picks = season.picks
  // The shelf: open quarter items you wrote down but haven't chosen yet.
  // Excludes items demoted this session — those live in the set-aside tray.
  const shelf = useMemo(
    () => season.shelf.filter((b) => !setAsideIds.includes(b.id)),
    [season.shelf, setAsideIds],
  )
  const picksByGoal = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const p of picks) {
      const key = p.goalId ?? '__none__'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(p)
    }
    return m
  }, [picks])

  const activeGoals = host.goals.filter((g) => g.status === 'active')
  const capReached = picks.length >= PICK_CAP
  const focusNudge = goalsInFocusNudge(
    picks.filter((p) => p.goalId).map((p) => p.goalId as string),
  )

  const addPick = async (goalId: string | undefined, title: string) => {
    const t = title.trim()
    if (!t) return
    await host.createTaskInBucket(t, 'quarter', { goalId, pickedAt: new Date() })
    setOpenGoal(null)
  }

  if (standalone) {
    const loose = picksByGoal.get('__none__') ?? []
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">Job search, admin, one-off fun — picks that don't serve any goal. Belongs under a goal after all? File it. Not really a pick? Set it aside.</p>
        {loose.map((p) => (
          <div key={p.id} className="relative flex items-center justify-between gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2 text-sm">
            <span className="truncate text-neutral-700">{p.title}</span>
            <div className="flex items-center gap-1 shrink-0">
              <div className="relative">
                <button type="button" aria-label={`File "${p.title}" under a goal`}
                  onClick={() => setShelfMenu((m) => (m === p.id ? null : p.id))}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary-200 px-2 py-0.5 text-xs text-primary-700 hover:bg-primary-50">
                  File under <ChevronDown className="w-3 h-3" />
                </button>
                {shelfMenu === p.id && (
                  <>
                    <button aria-hidden tabIndex={-1} onClick={() => setShelfMenu(null)}
                      className="fixed inset-0 z-40 cursor-default" />
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                      <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">File under</p>
                      {activeGoals.map((g) => (
                        <button key={g.id} type="button"
                          onClick={() => { host.onUpdateTask(p.id, { goalId: g.id }); setShelfMenu(null) }}
                          className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button type="button" aria-label={`Set aside ${p.title}`}
                onClick={() => setAside(p.id)}
                className="p-1 text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <InlineAdd placeholder="A pick that serves no goal…" onAdd={(v) => addPick(undefined, v)} disabled={capReached} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeGoals.map((goal) => {
        const gp = picksByGoal.get(goal.id) ?? []
        const isSkipped = skipped.has(goal.id)
        return (
          <section key={goal.id} data-goal-id={goal.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverGoal(goal.id) }}
            onDragLeave={() => setDragOverGoal((g) => (g === goal.id ? null : g))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverGoal(null)
              const id = e.dataTransfer.getData('text/plain')
              if (!id) return
              // Dragging a shelf item onto a goal picks AND threads it in one
              // motion; dragging an existing pick just re-parents it.
              const dragged = tasksById.get(id)
              host.onUpdateTask(id, {
                goalId: goal.id,
                ...(dragged && !dragged.pickedAt ? { pickedAt: new Date() } : {}),
              })
            }}
            className={`rounded-2xl border bg-white/70 p-3 ${dragOverGoal === goal.id ? 'border-primary-300 ring-2 ring-primary-300' : 'border-neutral-100'}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-display text-neutral-800">{goal.name}</h3>
              {gp.length === 0 && !isSkipped && (
                <button type="button" onClick={() => setSkipped((s) => new Set(s).add(goal.id))}
                  className="text-xs text-neutral-400 hover:text-neutral-600">Nothing this season</button>
              )}
              {isSkipped && <span className="text-xs text-neutral-400">— skipped</span>}
            </div>
            <ul className="mt-2 space-y-1">
              {gp.map((p) => {
                const hint = coherenceHint(p.title, goal.name)
                return (
                  <li key={p.id}>
                    <div draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                      className="flex items-center gap-2 rounded-lg bg-primary-600 text-white px-2.5 py-1 text-xs w-fit cursor-grab active:cursor-grabbing">
                      <Check className="w-3 h-3" strokeWidth={3} />
                      <span>{p.title}</span>
                      <button type="button" aria-label={`Set aside ${p.title}`}
                        onClick={() => setAside(p.id)}
                        className="ml-1 text-white/70 hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {hint && <p className="mt-0.5 text-[11px] text-amber-700">{hint}</p>}
                  </li>
                )
              })}
            </ul>
            {!isSkipped && (
              openGoal === goal.id ? (
                <InlineAdd placeholder="What would move this goal this season?" autoFocus
                  onAdd={(v) => addPick(goal.id, v)} disabled={capReached} />
              ) : (
                <button type="button" onClick={() => setOpenGoal(goal.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary-700 border border-dashed border-primary-200 rounded-md px-2 py-1 hover:bg-primary-50">
                  <Plus className="w-3 h-3" /> Add a pick for this season
                </button>
              )
            )}
            {/* AI fuel, scoped to THIS goal: the goal name is the above-list and
                its existing picks ride in as do-not-duplicate. Tapping a chip is
                the ONLY write path — it adds the pick directly (goal-anchored,
                picked at insert). Offline degrades to one quiet line. */}
            {!isSkipped && (
              <div className="mt-2">
                <ListSuggestions
                  bucket="quarter"
                  aboveItems={[goal.name]}
                  aboveLabel={`the goal “${goal.name}”`}
                  existingItems={gp.map((p) => p.title)}
                  onPick={(title) => { if (!capReached) void addPick(goal.id, title) }}
                  suggestLabel="Suggest picks"
                  pickCta="Tap to add it as a pick for this goal."
                />
              </div>
            )}
          </section>
        )
      })}
      {focusNudge && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{focusNudge}</p>}
      {setAsideIds.length > 0 && (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
          <h3 className="text-xs font-medium text-neutral-500">Set aside this season</h3>
          <ul className="mt-2 space-y-1">
            {setAsideIds.map((id) => {
              const p = tasksById.get(id)
              if (!p) return null
              return (
                <li key={id} className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                  <span>{p.title}</span>
                  <div className="flex items-center gap-3">
                    {lastSetAside === id && (
                      <button type="button" onClick={() => pickAgain(id)}
                        className="text-neutral-400 hover:text-neutral-600 underline">Undo</button>
                    )}
                    <button type="button" aria-label={`Pick again ${p.title}`}
                      onClick={() => pickAgain(id)}
                      className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800">
                      <RotateCcw className="w-3 h-3" /> Pick again
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
            Things you wrote down but haven&rsquo;t chosen yet. File one under a goal to make it a pick — or drag it onto a goal above.
          </p>
          <ul className="space-y-1">
            {shelf.map((item) => (
              <li key={item.id} draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                className="relative flex items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-white px-2.5 py-1.5 text-xs cursor-grab active:cursor-grabbing">
                <span className="truncate text-neutral-700">{item.title}</span>
                <div className="relative shrink-0">
                  <button type="button" aria-label={`File "${item.title}" under a goal`}
                    onClick={() => setShelfMenu((m) => (m === item.id ? null : item.id))}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary-200 px-2 py-0.5 text-primary-700 hover:bg-primary-50">
                    File under <ChevronDown className="w-3 h-3" />
                  </button>
                  {shelfMenu === item.id && (
                    <>
                      <button aria-hidden tabIndex={-1} onClick={() => setShelfMenu(null)}
                        className="fixed inset-0 z-40 cursor-default" />
                      <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                        <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Pick under</p>
                        {activeGoals.map((g) => (
                          <button key={g.id} type="button"
                            onClick={() => { host.onUpdateTask(item.id, { pickedAt: new Date(), goalId: g.id }); setShelfMenu(null) }}
                            className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                            {g.name}
                          </button>
                        ))}
                        <div className="my-1 border-t border-neutral-100" />
                        <button type="button"
                          onClick={() => { host.onUpdateTask(item.id, { pickedAt: new Date(), goalId: undefined }); setShelfMenu(null) }}
                          className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-500 hover:bg-neutral-50">
                          No goal (standalone)
                        </button>
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

function InlineAdd({ placeholder, onAdd, disabled, autoFocus }: {
  placeholder: string; onAdd: (v: string) => void; disabled?: boolean; autoFocus?: boolean
}) {
  const [v, setV] = useState('')
  return (
    <div className="mt-2 flex items-center gap-2">
      <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(v); setV('') } }}
        className="input-base flex-1 text-sm" />
      <button type="button" disabled={disabled} onClick={() => { onAdd(v); setV('') }}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">Add pick</button>
    </div>
  )
}
