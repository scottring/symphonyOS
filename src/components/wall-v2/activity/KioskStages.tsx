// The kiosk's engaged activities, laid out as the approved boards
// (conversational canvas, slice 7): Dinner, Groceries, Cooking, Held,
// Departure and Routine (bedtime). Presentation only — every state change is
// a KioskEvent and every write goes through a handler the Shell owns.

import { useState, type Dispatch } from 'react'
import { Check, ChefHat, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, ShoppingCart, Square, BookOpen, AlertTriangle, Timer } from 'lucide-react'
import {
  servesFactor, MIN_SERVES, MAX_SERVES,
  type CookingSession, type KioskEvent, type KioskState,
} from '@/lib/wall/activity/kioskActivity'
import { formatRemaining, isTimerDone, remainingMs, timerProgress, durationsInStep, type KioskTimer } from '@/lib/wall/activity/kioskTimers'
import { grocerySummary, linesToAdd, linesToRetry, type GroceryLine, type GroceryProposal } from '@/lib/wall/activity/groceryProposal'
import { ingredientsForStep, cookingSteps, ingredientParts } from '@/lib/wall/activity/cookingModel'
import { countdownLabel, type BedtimeGrid, type DepartureModel } from '@/lib/wall/activity/kioskRoutines'
import type { CookingRecipe } from './useCookingRecipe'
import type { CookingSource } from '@/lib/wall/activity/kioskActivity'
import type { KidRow } from '@/lib/wall/kidDayModel'

export interface KioskDinner {
  /** Recipe identity for cooking (recipe id, else url); null = nothing to cook from. */
  key: string | null
  title: string
  imageUrl: string | null
  /** "Dinner at 6:30 PM" */
  timeLabel: string | null
  /** When dinner is (epoch ms), if the plan says. */
  at?: number | null
  minutes: number | null
  cue: string | null
  /** The recipe's ingredient lines, unscaled. */
  ingredients: string[]
  source: CookingSource | null
  /** The whole recipe can be opened (stored body or a link). */
  hasRecipe: boolean
  baseServes: number
}

export function Photo({ url, className = '' }: { url: string | null; className?: string }) {
  return url
    ? <img src={url} alt="" className={`kc-photo ${className}`} />
    : <div aria-hidden="true" className={`kc-photo kc-photo-empty ${className}`}><ChefHat /></div>
}

const hm = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')

function Qty({ qty, was }: { qty: string; was: string | null }) {
  if (!qty) return null
  return <span className={`kc-qty ${was ? 'is-changed' : ''}`}>{qty}{was && <small>was {was}</small>}</span>
}

// ─── Dinner (board: Kiosk-Dinner) ──────────────────────────────────

export function DinnerStage({ d, state, nowMs, dispatch, onStartCooking, onAddMissing, onOpenRecipe }: {
  d: KioskDinner
  state: KioskState
  nowMs: number
  dispatch: Dispatch<KioskEvent>
  onStartCooking: () => void
  onAddMissing: () => void
  onOpenRecipe: () => void
}) {
  const serves = state.serves ?? d.baseServes
  const factor = servesFactor(serves, d.baseServes)
  const missing = d.ingredients.filter((_, i) => !state.have.includes(i)).length
  const resuming = state.cooking?.key === d.key && !!state.cooking
  return (
    <div className="kc-dinner">
      <Photo url={d.imageUrl} className="kc-dinner-photo" />
      <section className="kc-dinner-mid" aria-label="Tonight’s dinner">
        <h2 className="kc-h1">{d.title}</h2>
        <p className="kc-facts">
          {[d.minutes ? `${d.minutes} min` : null, d.minutes ? `ready by ${hm(new Date(nowMs + d.minutes * 60_000))} if you start now` : d.timeLabel].filter(Boolean).join(' · ')}
        </p>
        {d.cue && <p className="kc-cue">{d.cue}</p>}
        <div className="kc-serves" role="group" aria-label="Servings">
          <button type="button" className="kc-btn kc-square" aria-label="Fewer servings" disabled={serves <= MIN_SERVES} onClick={() => dispatch({ type: 'SET_SERVES', serves: serves - 1 })}><Minus aria-hidden="true" /></button>
          <b aria-live="polite">{serves}</b>
          <button type="button" className="kc-btn kc-square" aria-label="More servings" disabled={serves >= MAX_SERVES} onClick={() => dispatch({ type: 'SET_SERVES', serves: serves + 1 })}><Plus aria-hidden="true" /></button>
          <span>{serves === 1 ? 'person' : 'people'}</span>
        </div>
        {/* Recipes don't store a yield yet: the base is an assumption and says so. */}
        <p className="kc-was-line">{serves === d.baseServes ? `As written · serves ${d.baseServes} (assumed)` : `Changed from ${d.baseServes} · quantities updated`}</p>
        <div className="kc-acts">
          {d.source
            ? <button type="button" className="kc-btn kc-big is-accent" onClick={onStartCooking}>{resuming ? `Back to cooking · step ${state.cooking!.step + 1}` : 'Start cooking'}</button>
            : <p className="kc-muted">No steps saved for this one.</p>}
          {d.ingredients.length > 0 && (
            <button type="button" className="kc-btn kc-big" onClick={onAddMissing} disabled={missing === 0}>Add what’s missing{missing ? ` · ${missing}` : ''}</button>
          )}
          {d.hasRecipe && <button type="button" className="kc-btn" onClick={onOpenRecipe}><BookOpen aria-hidden="true" />Whole recipe</button>}
        </div>
      </section>
      <section className="kc-card kc-ingredients" aria-label="Ingredients">
        <p className="kc-lab">Ingredients · for {serves}</p>
        {d.ingredients.length === 0 && <p className="kc-quiet-line">No ingredient list saved.</p>}
        <p className="kc-muted kc-small">Tap what you already have.</p>
        <ul>
          {d.ingredients.map((line, i) => {
            const have = state.have.includes(i)
            const p = ingredientParts(line, factor)
            return (
              <li key={i}>
                <button type="button" aria-pressed={have} aria-label={`${line}${have ? ', have it' : ''}`} className={`kc-ing ${have ? 'is-have' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_HAVE', index: i })}>
                  <span className="kc-box" aria-hidden="true">{have && <Check />}</span>
                  <span className="kc-ing-name">{p.name}</span>
                  <Qty qty={p.qty} was={p.was} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

// ─── Groceries (board: Kiosk-Groceries) ────────────────────────────

const LINE_STATE: Record<GroceryLine['state'], string> = {
  'will-add': '', skip: 'Leaving off', saving: 'Saving…', added: 'Added', failed: 'Didn’t save',
}

export function GroceriesStage({ proposal, listTitle, listItems, context, compact, dispatch, onSave, onRetry }: {
  proposal: GroceryProposal
  listTitle: string | null
  /** The list's open items, to show where the new ones will go. */
  listItems: string[] | null
  /** What the proposal is for: tonight's dinner, or the recipe on the stove. */
  context: { title: string; imageUrl: string | null; sub: string } | null
  /** Held column showing: drop the context card (the column already says it). */
  compact: boolean
  dispatch: Dispatch<KioskEvent>
  onSave: () => void
  onRetry: () => void
}) {
  const sum = grocerySummary(proposal)
  const toAdd = linesToAdd(proposal).length
  const toRetry = linesToRetry(proposal).length
  const list = listTitle ?? 'Groceries'
  const incoming = proposal.lines.filter((l) => l.state !== 'skip')
  const incomingNorm = new Set(incoming.map((l) => l.text.toLowerCase()))
  const existing = (listItems ?? []).filter((t) => !incomingNorm.has(t.toLowerCase())).slice(0, 8)
  return (
    <div className={`kc-groceries ${compact || !context ? 'is-compact' : ''}`}>
      {!compact && context && (
        <section className="kc-card kc-mini" aria-label={context.title}>
          <Photo url={context.imageUrl} className="kc-mini-photo" />
          <h3>{context.title}</h3>
          <p>{context.sub}</p>
        </section>
      )}
      <section className="kc-card kc-prop" aria-label="Proposal">
        <h2 className="kc-h2">Add these to {list}?</h2>
        <p className="kc-muted kc-sub">{proposal.origin === 'cooking' ? 'Out of something? Tap what to add.' : 'Missing for tonight. Tap any to leave it off.'}</p>
        <ul>
          {proposal.lines.map((l) => {
            const locked = l.state === 'saving' || l.state === 'added' || l.state === 'failed'
            const p = ingredientParts(l.text, 1)
            const label = l.alreadyListed ? 'Already on the list' : LINE_STATE[l.state]
            return (
              <li key={l.key}>
                <button type="button" aria-pressed={l.state === 'will-add'} disabled={locked}
                  aria-label={`${l.text}${label ? ` — ${label}` : ''}`}
                  className={`kc-ing kc-tog is-${l.state}`} onClick={() => dispatch({ type: 'GROCERY_TOGGLE', key: l.key })}>
                  <span className="kc-box" aria-hidden="true">{(l.state === 'will-add' || l.state === 'added' || l.state === 'saving') && <Check />}{l.state === 'failed' && <AlertTriangle />}</span>
                  <span className="kc-ing-name">{p.name}{label && <small>{label}</small>}</span>
                  <Qty qty={p.qty} was={null} />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="kc-muted" role="status" aria-live="polite">
          {[sum.added && `${sum.added} added`, sum.saving && `${sum.saving} saving`, sum.failed && `${sum.failed} didn’t save`].filter(Boolean).join(' · ')}
        </p>
        <div className="kc-row2">
          <button type="button" className="kc-btn kc-big is-accent kc-grow" disabled={!listTitle || toAdd === 0} onClick={onSave}>
            {toAdd ? `Add ${toAdd} to ${list}` : `Add to ${list}`}
          </button>
          {toRetry > 0 && <button type="button" className="kc-btn kc-big is-warn" onClick={onRetry}><RotateCcw aria-hidden="true" />Retry {toRetry}</button>}
          <button type="button" className="kc-btn kc-big" onClick={() => dispatch({ type: 'BACK' })}>Not now</button>
        </div>
        {!listTitle && <p className="kc-muted">There’s no family grocery list yet.</p>}
      </section>
      <section className="kc-card kc-glist" aria-label={`${list} list`}>
        <p className="kc-lab">{list} · where they’ll go</p>
        {incoming.length === 0 && existing.length === 0 && <p className="kc-quiet-line">Nothing on the list yet.</p>}
        <ul>
          {incoming.map((l) => <li key={l.key} className={`kc-li is-new is-${l.state}`}><span className="kc-dot" aria-hidden="true" />{ingredientParts(l.text, 1).name}</li>)}
          {existing.map((t, i) => <li key={`e${i}`} className="kc-li"><span className="kc-dot" aria-hidden="true" />{t}</li>)}
        </ul>
      </section>
    </div>
  )
}

// ─── Timers ────────────────────────────────────────────────────────

export function TimerBox({ t, nowMs, dispatch, quiet = false }: { t: KioskTimer; nowMs: number; dispatch: Dispatch<KioskEvent>; quiet?: boolean }) {
  const done = isTimerDone(t, nowMs)
  return (
    <li className={`kc-tm ${done ? 'is-done' : ''} ${quiet ? 'is-quiet' : ''}`} style={{ ['--kc-progress' as string]: `${Math.round(timerProgress(t, nowMs) * 100)}%` }}>
      <small>{t.label}</small>
      <b role={done ? 'alert' : undefined}>{done ? 'Done' : formatRemaining(remainingMs(t, nowMs))}</b>
      {!quiet && (
        <div className="kc-tm-r">
          <button type="button" className="kc-btn" onClick={() => dispatch({ type: 'ADD_MINUTE', id: t.id, now: Date.now() })} aria-label={`Add a minute to ${t.label}`}>+1 min</button>
          <button type="button" className="kc-btn" onClick={() => dispatch({ type: 'STOP_TIMER', id: t.id })} aria-label={`Stop ${t.label}`}><Square aria-hidden="true" />Stop</button>
        </div>
      )}
    </li>
  )
}

export function TimerList({ timers, nowMs, dispatch }: { timers: KioskTimer[]; nowMs: number; dispatch: Dispatch<KioskEvent> }) {
  if (!timers.length) return null
  return <ul className="kc-timers" aria-label="Timers">{timers.map((t) => <TimerBox key={t.id} t={t} nowMs={nowMs} dispatch={dispatch} />)}</ul>
}

// ─── Cooking (board: Kiosk-Cooking) ────────────────────────────────

function IngList({ indices, recipe, factor, now }: { indices: number[]; recipe: CookingRecipe; factor: number; now: boolean }) {
  if (!indices.length) return <p className="kc-muted kc-small">Nothing new from the list.</p>
  return (
    <ul>
      {indices.map((i) => {
        const p = ingredientParts(recipe.ingredients[i], factor)
        return <li key={i} className={`kc-ing is-static ${now ? 'is-now' : ''}`}><span className="kc-ing-name">{p.name}</span><Qty qty={p.qty} was={null} /></li>
      })}
    </ul>
  )
}

export function CookingStage({ session, recipe, loading, error, timers, nowMs, dispatch, onStartTimer, onOutOfSomething, onOpenRecipe }: {
  session: CookingSession
  recipe: CookingRecipe | null
  loading: boolean
  error: string | null
  timers: KioskTimer[]
  nowMs: number
  dispatch: Dispatch<KioskEvent>
  onStartTimer: (minutes: number, label: string) => void
  onOutOfSomething: () => void
  onOpenRecipe: () => void
}) {
  const [presets, setPresets] = useState(false)
  if (loading) return <div className="kc-empty"><ChefHat aria-hidden="true" /><p>Getting the steps for {session.title}…</p></div>
  const steps = cookingSteps(recipe?.instructions)
  if (error || !recipe || steps.length === 0) {
    return (
      <div className="kc-empty">
        <ChefHat aria-hidden="true" />
        <p>{error ? `Couldn’t load the steps: ${error}` : 'This recipe has no step-by-step directions saved.'}</p>
        <div className="kc-acts is-row">
          <button type="button" className="kc-btn" onClick={onOpenRecipe}><BookOpen aria-hidden="true" />Whole recipe</button>
          <button type="button" className="kc-btn" onClick={() => dispatch({ type: 'FINISH_COOKING' })}>Stop cooking</button>
        </div>
      </div>
    )
  }
  const i = Math.min(session.step, steps.length - 1)
  const factor = servesFactor(session.serves, session.baseServes)
  const step = steps[i]
  const usesNow = ingredientsForStep(step, recipe.ingredients)
  const usesNext = i + 1 < steps.length ? ingredientsForStep(steps[i + 1], recipe.ingredients).filter((x) => !usesNow.includes(x)) : []
  const suggested = durationsInStep(step)
  const last = i === steps.length - 1
  const stepLabel = `Step ${i + 1}`
  const start = (m: number) => { onStartTimer(m, `${stepLabel} · ${m} min`); setPresets(false) }
  return (
    <div className="kc-cooking">
      <section className="kc-card kc-cook-ings" aria-label="Ingredients">
        <p className="kc-lab">For this step</p>
        <IngList indices={usesNow} recipe={recipe} factor={factor} now />
        {!last && <><p className="kc-lab kc-gap">Next step</p><IngList indices={usesNext} recipe={recipe} factor={factor} now={false} /></>}
        <button type="button" className="kc-btn kc-wide-btn" onClick={onOutOfSomething}><ShoppingCart aria-hidden="true" />Out of something?</button>
      </section>
      <section className="kc-card kc-step" aria-label={`Step ${i + 1} of ${steps.length}`}>
        <nav className="kc-bars" aria-label="Steps">
          {steps.map((_, n) => (
            <button key={n} type="button" aria-label={`Go to step ${n + 1}`} aria-current={n === i ? 'step' : undefined}
              className={n === i ? 'is-current' : n < i ? 'is-done' : ''} onClick={() => dispatch({ type: 'GO_STEP', step: n })} />
          ))}
        </nav>
        <p className="kc-sn">Step {i + 1} of {steps.length}</p>
        <p className="kc-step-text" aria-live="polite">{step}</p>
        <div className="kc-nav2">
          <button type="button" className="kc-btn" disabled={i === 0} onClick={() => dispatch({ type: 'PREV_STEP' })}><ChevronLeft aria-hidden="true" />{i > 0 ? `Step ${i}` : 'Back a step'}</button>
          {last
            ? <button type="button" className="kc-btn is-accent" onClick={() => dispatch({ type: 'FINISH_COOKING' })}><Check aria-hidden="true" />Done cooking</button>
            : <button type="button" className="kc-btn is-accent" onClick={() => dispatch({ type: 'NEXT_STEP' })}>Next step<ChevronRight aria-hidden="true" /></button>}
        </div>
      </section>
      <section className="kc-cook-timers" aria-label="Kitchen timers">
        <TimerList timers={timers} nowMs={nowMs} dispatch={dispatch} />
        {suggested.slice(0, 1).map((m) => (
          <button key={m} type="button" className="kc-btn kc-wide-btn is-accent" onClick={() => start(m)}><Timer aria-hidden="true" />{m} min timer · this step</button>
        ))}
        <button type="button" className="kc-btn kc-wide-btn" aria-expanded={presets} onClick={() => setPresets((p) => !p)}><Plus aria-hidden="true" />Timer</button>
        {presets && (
          <div className="kc-presets">
            {[1, 5, 10, 15, 20, 30].map((m) => <button key={m} type="button" className="kc-btn" onClick={() => start(m)}>{m} min</button>)}
          </div>
        )}
      </section>
    </div>
  )
}

/** Board: Kiosk-Held — the cooking step and its running timers stay visible
 *  (left) while another activity has the stage. */
export function HeldColumn({ session, recipe, timers, nowMs, dispatch }: {
  session: CookingSession | null
  recipe: CookingRecipe | null
  timers: KioskTimer[]
  nowMs: number
  dispatch: Dispatch<KioskEvent>
}) {
  const steps = cookingSteps(recipe?.instructions)
  const step = session && steps.length ? steps[Math.min(session.step, steps.length - 1)] : null
  return (
    <aside className="kc-card kc-held" aria-label={session ? 'Cooking, held' : 'Timers'}>
      <p className="kc-lab">{session ? `Cooking · held at step ${session.step + 1}` : 'Timers · still running'}</p>
      {session && <h3>{session.title}</h3>}
      {step && <p className="kc-held-step">{step}</p>}
      <ul className="kc-timers">{timers.map((t) => <TimerBox key={t.id} t={t} nowMs={nowMs} dispatch={dispatch} quiet />)}</ul>
      {session && <button type="button" className="kc-btn kc-big is-accent kc-push" onClick={() => dispatch({ type: 'RESUME_COOKING' })}>Back to cooking</button>}
    </aside>
  )
}

// ─── Leaving (board: Kiosk-Departure) ──────────────────────────────

export function DepartureStage({ model, nowMs, dispatch, onOpenPerson }: { model: DepartureModel; nowMs: number; dispatch: Dispatch<KioskEvent>; onOpenPerson: (id: string) => void }) {
  const now = new Date(nowMs)
  const pct = model.total ? Math.round((model.done / model.total) * 100) : 0
  return (
    <div className="kc-departure">
      <div className="kc-dep-hero">
        {model.at
          ? <>
              <b>{countdownLabel(model.at, now).replace(/^in /, '')}</b>
              <div>until {hm(model.at)}<span>{model.atLabel} · that’s the start time; no travel time is saved</span></div>
            </>
          : <><b className="is-text">Out the door</b><div>No departure time today<span>Tick things off as they go in bags.</span></div></>}
        <div className="kc-progress" role="progressbar" aria-label="Ready" aria-valuemin={0} aria-valuemax={model.total} aria-valuenow={model.done}><i style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="kc-dep-cols" style={{ ['--kc-cols' as string]: String(Math.max(1, model.people.length)) }}>
        {model.people.map((p, idx) => {
          const ready = p.items.length > 0 && p.items.every((i) => i.done)
          return (
            <section key={p.memberId} className="kc-card" aria-label={p.name}>
              <div className="kc-ph">
                <button type="button" className="kc-person" onClick={() => onOpenPerson(p.memberId)}><span className={`kc-av tone-${idx % 4}`} aria-hidden="true">{p.name.slice(0, 1)}</span>{p.name}</button>
                <span className={`kc-ready ${ready ? 'is-on' : ''}`}>{p.items.length === 0 ? 'NOTHING TO PACK' : ready ? 'READY' : 'NOT YET'}</span>
              </div>
              {p.items.length === 0 && <p className="kc-quiet-line">Nothing to remember.</p>}
              <ul>
                {p.items.map((it) => (
                  <li key={it.key}>
                    <button type="button" aria-pressed={it.done} className={`kc-ing kc-it ${it.done ? 'is-have' : ''}`} onClick={() => dispatch({ type: 'DEPARTURE_TOGGLE', key: it.key })}>
                      <span className="kc-box" aria-hidden="true">{it.done && <Check />}</span>
                      <span className="kc-ing-name">{it.text}{it.kind !== 'bring' && <small>{it.kind === 'homework' ? 'Homework' : 'To do'}</small>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {model.people.length === 0 && <section className="kc-card"><p className="kc-quiet-line">No one has anything to pack.</p></section>}
      </div>
      <div className="kc-dep-foot">
        <p className="kc-muted kc-small">Ticks here are packing marks on this wall; they don’t complete anyone’s tasks.</p>
        <button type="button" className="kc-btn kc-big is-accent" onClick={() => dispatch({ type: 'DEPARTURE_DONE' })}><Check aria-hidden="true" />Everyone’s out</button>
      </div>
    </div>
  )
}

// ─── Bedtime (board: Kiosk-Routine) ────────────────────────────────

export function BedtimeStage({ grid, onTick }: { grid: BedtimeGrid; onTick: (memberId: string, row: KidRow) => void }) {
  if (grid.people.length === 0) {
    return <div className="kc-card kc-bed-card"><p className="kc-quiet-line">No bedtime routine tonight.</p></div>
  }
  // The current step: the first one somebody still has to do.
  const current = grid.steps.find((s) => s.cells.some((c) => c.row && !c.row.done))?.key
  return (
    <div className="kc-card kc-bed-card">
      <table className="kc-bed-grid" style={{ ['--kc-cols' as string]: String(grid.people.length) }}>
        <thead>
          <tr>
            <th scope="col" className="kc-lab">Steps · {grid.done} of {grid.total}</th>
            {grid.people.map((p, idx) => <th key={p.id} scope="col"><span className={`kc-av tone-${idx % 4}`} aria-hidden="true">{p.name.slice(0, 1)}</span>{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.steps.map((s) => (
            <tr key={s.key} className={s.key === current ? 'is-current' : ''}>
              <th scope="row">{s.title}</th>
              {s.cells.map((c) => {
                const name = grid.people.find((p) => p.id === c.memberId)?.name ?? ''
                return (
                  <td key={c.memberId}>
                    {c.row
                      ? <button type="button" aria-pressed={c.row.done} aria-label={`${name}: ${s.title}`} className={`kc-tick ${c.row.done ? 'is-on' : ''}`} onClick={() => onTick(c.memberId, c.row!)}>
                          {c.row.done ? <Check aria-hidden="true" /> : null}
                        </button>
                      : <span className="kc-tick is-na" role="img" aria-label={`${name}: not in their routine`} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
