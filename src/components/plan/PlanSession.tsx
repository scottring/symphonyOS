// src/components/plan/PlanSession.tsx
//
// "Plan October": Look back at September · Plan October · Save — the level
// above beside you the whole time (spec: guided planning, Phase 1). A pure
// view over a SessionDraft; the page owns loading, the draft store and Save.
// The page hands in the PRUNED draft (pruneDraft), the same one it saves, so
// the summary here is exactly what Save writes.

import { useMemo, useState } from 'react'
import { Target, Check } from 'lucide-react'
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { verdictOptions, summarize, weekTaskListLabel, placementLevelOf, type SessionDraft, type SessionLevel, type Verdict } from '@/lib/planning/session'
import { stepsThatCarryForward } from '@/lib/planning/goalSteps'
import { Hint } from './Hint'

type Step = 'back' | 'plan' | 'save'
/** The row's REAL id, fixed when it is written into the draft: creating it twice finds the first (idempotent insert, Task 0). */
const newId = () => crypto.randomUUID()

export function PlanSession({ level, aboveLabel, dayOptions = [], periodLabel: P, prevLabel: Q, finished, open, current, above, aboveGoals, hiddenStepGoals, domainInView = null, uid = null, draft, onChange, onClose, onSave, saving, saveError }: {
  /** The level being planned. The week plans tasks only, and may name a day. */
  level: SessionLevel
  /** The level above, as this session names it: 'the season' for a month, 'October' for a week. */
  aboveLabel: string
  /** Week only: the seven days this week offers a task. */
  dayOptions?: Array<{ ymd: string; label: string }>
  periodLabel: string; prevLabel: string
  finished: Task[]; open: Task[]; current: Task[]; above: Task[]; aboveGoals: Task[]
  /** Goals whose open steps this view hides — a Keep carries them too, and the summary says so. */
  hiddenStepGoals?: ReadonlySet<string>
  /** The domain in view — a new item is created in it (recorded as it is added, not at Save). */
  domainInView?: DomainId | null
  /** The signed-in person, for the first-time hints' per-user storage key. */
  uid?: string | null
  draft: SessionDraft; onChange: (d: SessionDraft) => void
  onClose: () => void; onSave: () => Promise<void>; saving: boolean; saveError?: boolean
}) {
  const nothingBack = finished.length === 0 && open.length === 0
  const [step, setStep] = useState<Step>(nothingBack ? 'plan' : 'back')
  const [goalText, setGoalText] = useState('')
  const [goalFor, setGoalFor] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskToward, setTaskToward] = useState('')
  const [taskDay, setTaskDay] = useState('')
  const week = level === 'week'
  const season = level === 'season'
  const year = level === 'year'
  const copy = {
    backSub: week
      ? `This is ${Q}'s actual list. Keep what still matters; a ticked row is already done.`
      : year
      ? `This is ${Q}'s goals. Keep what still matters into ${P}; Done marks it finished; Drop archives it.`
      : `This is ${Q}'s actual list. A next action is a new task toward the goal; the goal itself stays.`,
    finished: week ? `Finished ${Q}` : `Finished in ${Q}`,
    planHead: week ? `What will you get done ${P}?` : year ? `What will ${P} add up to?` : `What will ${P} add up to, and what will you do?`,
    planSub: week
      ? `Look at ${aboveLabel} beside you. Add what ${P} can take; most things don't need a day.`
      : year
      ? 'Goals only. Seasons and months plan the work.'
      : season
      ? `Write ${P}'s goals with ${aboveLabel} beside you, then the tasks that move them. Goals are never scheduled.`
      : `Write ${P}'s goals with the season beside you, then the tasks that move them. Goals are never scheduled.`,
    saveHead: week ? 'Here\'s the week' : year ? `Here's ${P}` : `Here's ${P}'s plan`,
    taskHead: week ? weekTaskListLabel(P) : `${P} tasks`,
    marker: week ? `· on ${P}` : `· in ${P}`,
    aboveEmpty: season ? `${aboveLabel} has no goals yet.` : `${aboveLabel} has no list yet.`,
    goalForWord: season ? aboveLabel : 'season',
  }
  // "Keep, and add a next action" with no action named would save as a plain
  // Keep and silently lose the action — so the session will not move on
  // until the row is named or switched to Keep.
  const unnamedActions = week ? [] : open.filter((t) => draft.verdicts[t.id] === 'keep-action' && !draft.actionTitles[t.id]?.trim()).map((t) => t.id)
  const [askForActions, setAskForActions] = useState(false)
  const goTo = (next: Step) => {
    if (next !== 'back' && unnamedActions.length > 0) { setAskForActions(true); setStep('back'); return }
    setAskForActions(false)
    setStep(next)
  }
  const set = (patch: Partial<SessionDraft>) => onChange({ ...draft, ...patch })

  const setVerdict = (id: string, v: Verdict) => {
    const verdicts = { ...draft.verdicts }
    if (verdicts[id] === v) delete verdicts[id]; else verdicts[id] = v
    const patch: Partial<SessionDraft> = { verdicts }
    // A year Keep needs the id the kept copy will be created with, fixed once
    // so a retried Save re-uses it (Task 2/4). A toggle off or away leaves a
    // stale id in place — harmless, and keeps a later retry idempotent.
    if (level === 'year' && verdicts[id] === 'keep' && !draft.keptIds?.[id]) {
      patch.keptIds = { ...(draft.keptIds ?? {}), [id]: newId() }
    }
    set(patch)
  }

  // What this month holds in the draft, for the Plan step and the "toward" options.
  const isKept = (id: string) => draft.verdicts[id] === 'keep' || draft.verdicts[id] === 'keep-action'
  const kept = open.filter((t) => isKept(t.id))
  // A kept goal's open steps travel with it (keepForward) unless they have a verdict of their own.
  const carried = kept.filter((g) => g.isGoal).flatMap((g) => stepsThatCarryForward(g.id, open, placementLevelOf(level))).filter((st) => !draft.verdicts[st.id])
  const monthGoals = week ? [] : [...current.filter((t) => t.isGoal), ...kept.filter((t) => t.isGoal)]
  const monthTasks = [...current.filter((t) => !t.isGoal), ...kept.filter((t) => !t.isGoal), ...carried]
    .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i)
  // A task toward a goal belongs to the goal's domain; a loose one to the domain in view.
  const towardOptions = [
    ...monthGoals.map((g) => ({ id: g.id, title: g.title, context: g.context ?? null })),
    ...draft.newGoals.map((g) => ({ id: g.id, title: g.title, context: g.context ?? null })),
  ]
  const lines = useMemo(() => summarize(draft, { open, above, aboveGoals, current, hiddenStepGoals, periodLabel: P, prevLabel: Q, aboveLabel }), [draft, open, above, aboveGoals, current, hiddenStepGoals, P, Q, aboveLabel])

  const steps: Array<[Step, string]> = [['back', `Look back at ${Q}`], ['plan', `Plan ${P}`], ['save', 'Save']]
  const idx = steps.findIndex(([s]) => s === step)

  return (
    <div className={`grid grid-cols-1 items-start gap-5 ${year ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
      <div className="min-w-0">
        <ol className="mb-4 flex overflow-hidden rounded-lg border border-neutral-200 text-[13px] font-semibold" aria-label="Planning steps">
          {steps.map(([s, label], i) => (
            <li key={s} aria-current={i === idx ? 'step' : undefined}
              className={`flex-1 px-2 py-2 text-center ${i === idx ? 'bg-neutral-900 text-white' : i < idx ? 'bg-sage-50 text-sage-600' : 'bg-neutral-50 text-neutral-400'}`}>
              {s === 'back' && nothingBack ? <span className="font-normal italic">Nothing to look back at</span> : <>{i < idx && '✓ '}{label}</>}
            </li>
          ))}
        </ol>

        {step === 'back' && (
          <section>
            <h2 className="font-display text-xl text-neutral-800">How did {Q} go?</h2>
            <p className="mt-1 text-sm text-neutral-500">{copy.backSub}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[13px] font-semibold text-neutral-700">What went well?
                <textarea className="input-base mt-1 min-h-[56px]" value={draft.wentWell} onChange={(e) => set({ wentWell: e.target.value })} />
              </label>
              <label className="text-[13px] font-semibold text-neutral-700">What didn't?
                <textarea className="input-base mt-1 min-h-[56px]" value={draft.didnt} onChange={(e) => set({ didnt: e.target.value })} />
              </label>
            </div>
            <p className="mt-1 text-[12px] text-neutral-400">Visible to your household.</p>
            {finished.length > 0 && (
              <>
                <h3 className="mt-5 border-b border-neutral-200 pb-1 font-display text-lg text-neutral-800">{copy.finished}</h3>
                <ul>{finished.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm text-neutral-600">
                    {t.isGoal ? <Target className="h-4 w-4 text-accent-600" /> : <Check className="h-4 w-4 text-sage-600" />}{t.title}
                  </li>))}</ul>
              </>
            )}
            {open.length > 0 && (
              <>
                <h3 className="mt-5 border-b border-neutral-200 pb-1 font-display text-lg text-neutral-800">Still open</h3>
                <ul>{open.map((t) => (
                  <li key={t.id} className="border-b border-neutral-100 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.isGoal && <Target className="h-4 w-4 text-accent-600" />}
                      <span className="min-w-[180px] flex-1 text-sm text-neutral-800">{t.title}</span>
                      <div className="flex flex-wrap gap-1">
                        {verdictOptions(!!t.isGoal, level).map((o) => (
                          <button key={o.verdict} type="button" aria-pressed={draft.verdicts[t.id] === o.verdict}
                            onClick={() => setVerdict(t.id, o.verdict)}
                            className={`rounded-md border px-2 py-1 text-[12.5px] font-semibold ${draft.verdicts[t.id] === o.verdict ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {draft.verdicts[t.id] === 'keep-action' && (
                      <label className="mt-2 block pl-6 text-[12.5px] text-neutral-500">Next action for {t.title}
                        <div className="mt-1">
                          <input className="input-base" value={draft.actionTitles[t.id] ?? ''}
                            aria-invalid={askForActions && unnamedActions.includes(t.id) ? true : undefined}
                            onChange={(e) => set({ actionTitles: { ...draft.actionTitles, [t.id]: e.target.value },
                              actionIds: { ...draft.actionIds, [t.id]: draft.actionIds[t.id] ?? newId() } })} />
                        </div>
                      </label>
                    )}
                    {askForActions && unnamedActions.includes(t.id) && (
                      <p role="alert" className="mt-1 pl-6 text-[12.5px] font-semibold text-accent-700">Name the next action, or choose Keep</p>
                    )}
                  </li>))}</ul>
              </>
            )}
          </section>
        )}

        {step === 'plan' && (
          <section>
            <h2 className="font-display text-xl text-neutral-800">{copy.planHead}</h2>
            <p className="mt-1 text-sm text-neutral-500">{copy.planSub}</p>
            {!week && (<>
            <h3 className="mt-4 border-b-2 border-primary-700 pb-1 font-display text-lg text-neutral-800">{P} goals</h3>
            {(level === 'month' || level === 'season') && (
              <div className="mt-2">
                <Hint name="month-goals" uid={uid}>Goals are what this period should add up to. They stay on this list; you look at them when you plan a week or a day.</Hint>
              </div>
            )}
            <ul>
              {monthGoals.map((g) => <li key={g.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm"><Target className="h-4 w-4 text-accent-600" />{g.title}</li>)}
              {draft.newGoals.map((g) => (
                <li key={g.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
                  <Target className="h-4 w-4 text-accent-600" />
                  <span className="flex-1">{g.title}{g.linkId && <span className="block text-[12px] text-neutral-400">for {aboveGoals.find((a) => a.id === g.linkId)?.title}</span>}</span>
                  <button type="button" className="text-[12px] text-primary-700" onClick={() => set({ newGoals: draft.newGoals.filter((x) => x.id !== g.id), newTasks: draft.newTasks.map((x) => (x.linkId === g.id ? { ...x, linkId: undefined } : x)) })}>Remove</button>
                </li>))}
            </ul>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => {
              e.preventDefault()
              const title = goalText.trim()
              if (!title || [...monthGoals.map((g) => g.title), ...draft.newGoals.map((g) => g.title)].some((x) => x.trim().toLowerCase() === title.toLowerCase())) return
              set({ newGoals: [...draft.newGoals, { id: newId(), title, linkId: goalFor || undefined, context: domainInView }] }); setGoalText(''); setGoalFor('')
            }}>
              <div className="min-w-[200px] flex-1"><input aria-label={`New goal for ${P}`} className="input-base" value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder={`A goal for ${P}`} /></div>
              {aboveGoals.length > 0 && (
                <select aria-label={`For a ${copy.goalForWord} goal`} className="rounded-md border border-neutral-200 px-2 text-sm" value={goalFor} onChange={(e) => setGoalFor(e.target.value)}>
                  <option value="">{`For a ${copy.goalForWord} goal? (optional)`}</option>
                  {aboveGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              )}
              <button type="submit" className="rounded-md border border-neutral-200 px-3 text-sm font-semibold">Add goal</button>
            </form>
            </>)}

            {!year && (<>
            <h3 className="mt-5 border-b border-neutral-300 pb-1 font-display text-lg text-neutral-800">{copy.taskHead}</h3>
            {week && (
              <div className="mt-2">
                <Hint name="week-list" uid={uid}>Adding a month task here puts it on this week's list too. The month keeps it and shows "on this week".</Hint>
              </div>
            )}
            <ul>
              {monthTasks.map((x) => <li key={x.id} className="border-b border-neutral-100 py-2 text-sm">{x.title}</li>)}
              {open.filter((t) => draft.verdicts[t.id] === 'keep-action' && draft.actionTitles[t.id]?.trim()).map((g) => (
                <li key={`a-${g.id}`} className="border-b border-neutral-100 py-2 text-sm">{draft.actionTitles[g.id]}<span className="block text-[12px] text-neutral-400">new next action toward {g.title}</span></li>))}
              {draft.newTasks.map((x) => (
                <li key={x.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
                  <span className="flex-1">{x.title}{x.linkId && <span className="block text-[12px] text-neutral-400">toward {towardOptions.find((o) => o.id === x.linkId)?.title}</span>}{x.day && <span className="block text-[12px] text-neutral-400">on {dayOptions.find((o) => o.ymd === x.day)?.label ?? x.day}</span>}</span>
                  <button type="button" className="text-[12px] text-primary-700" onClick={() => set({ newTasks: draft.newTasks.filter((y) => y.id !== x.id) })}>Remove</button>
                </li>))}
              {above.filter((a) => draft.takenFromAbove.includes(a.id)).map((a) => (
                <li key={`t-${a.id}`} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
                  <span className="flex-1">{a.title}<span className="block text-[12px] text-neutral-400">from {aboveLabel}</span></span>
                  <button type="button" className="text-[12px] text-primary-700" onClick={() => set({ takenFromAbove: draft.takenFromAbove.filter((id) => id !== a.id) })}>Remove</button>
                </li>))}
            </ul>
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => {
              e.preventDefault()
              const title = taskText.trim()
              if (!title) return
              const toward = towardOptions.find((o) => o.id === taskToward)
              set({ newTasks: [...draft.newTasks, { id: newId(), title, linkId: toward?.id, day: taskDay || undefined, context: toward ? toward.context : domainInView }] }); setTaskText(''); setTaskToward(''); setTaskDay('')
            }}>
              <div className="min-w-[200px] flex-1"><input aria-label={`New task for ${P}`} className="input-base" value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder={`A task for ${P}`} /></div>
              {week && (
                <select aria-label="Day for this task" className="rounded-md border border-neutral-200 px-2 text-sm" value={taskDay} onChange={(e) => setTaskDay(e.target.value)}>
                  <option value="">Any day</option>
                  {dayOptions.map((o) => <option key={o.ymd} value={o.ymd}>{o.label}</option>)}
                </select>
              )}
              {!week && towardOptions.length > 0 && (
                <select aria-label={`Toward a ${P} goal`} className="rounded-md border border-neutral-200 px-2 text-sm" value={taskToward} onChange={(e) => setTaskToward(e.target.value)}>
                  <option value="">Toward a {P} goal? (optional)</option>
                  {towardOptions.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              )}
              <button type="submit" className="rounded-md border border-neutral-200 px-3 text-sm font-semibold">Add task</button>
            </form>
            </>)}
          </section>
        )}

        {step === 'save' && (
          <section>
            <h2 className="font-display text-xl text-neutral-800">{copy.saveHead}</h2>
            {saveError
              ? <p role="alert" className="mt-1 text-sm text-accent-700">Some of this didn't save. It's still here and in your draft; Save again retries only these.</p>
              : <p className="mt-1 text-sm text-neutral-500">Nothing is saved yet.</p>}
            <ul className="mt-3 rounded-lg bg-sage-50 px-4 py-2">
              {lines.length === 0 && <li className="py-1.5 text-sm text-neutral-500">Nothing chosen.</li>}
              {lines.map((l, i) => (
                <li key={i} className="grid grid-cols-1 gap-1 border-t border-sage-100 py-1.5 text-sm first:border-t-0 sm:grid-cols-2">
                  <span className="text-neutral-800">{l.title}</span><span className="text-neutral-600">→ {l.destination}</span>
                </li>))}
            </ul>
          </section>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {step === 'back' || (step === 'plan' && nothingBack)
            ? <span />
            : <button type="button" className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm" onClick={() => setStep(step === 'save' ? 'plan' : 'back')}>← Back</button>}
          <button type="button" disabled={saving} className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm disabled:opacity-60" onClick={onClose}>Close · keep my draft</button>
          {step === 'back' && <button type="button" className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => goTo('plan')}>Next: plan {P} →</button>}
          {step === 'plan' && <button type="button" className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => goTo('save')}>Next: save →</button>}
          {step === 'save' && <button type="button" disabled={saving} className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => { void onSave() }}>{saving ? 'Saving…' : `Save ${P}`}</button>}
        </div>
      </div>

      {!year && (
        <aside className="min-w-0 rounded-xl bg-neutral-50 p-3 lg:sticky lg:top-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">{aboveLabel}</p>
          <ul className="mt-1">
            {aboveGoals.map((g) => <li key={g.id} className="flex items-center gap-1.5 border-t border-neutral-200 py-1.5 text-[13px] text-neutral-700"><Target className="h-3.5 w-3.5 text-accent-600" />{g.title}</li>)}
            {above.map((a) => (
              <li key={a.id} className="border-t border-neutral-200 py-1.5 text-[13px] text-neutral-700">
                {a.title}
                {step === 'plan' && (draft.takenFromAbove.includes(a.id)
                  ? <span className="ml-1 text-[12px] font-semibold text-sage-600">{copy.marker}</span>
                  : <button type="button" aria-label={`Add to ${P}: ${a.title}`} className="block text-[12px] font-semibold text-primary-700"
                      onClick={() => set({ takenFromAbove: [...draft.takenFromAbove, a.id] })}>+ Add to {P}</button>)}
              </li>))}
            {aboveGoals.length === 0 && above.length === 0 && <li className="py-1.5 text-[13px] text-neutral-400">{copy.aboveEmpty}</li>}
          </ul>
        </aside>
      )}
    </div>
  )
}
