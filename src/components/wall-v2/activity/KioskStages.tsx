// The kiosk's engaged activities (conversational canvas, slice 7): dinner,
// groceries, cooking (+ the held column it leaves behind), leaving, bedtime.
// Presentation only — every state change is a KioskEvent and every write
// goes through a handler the Shell already owns.

import type { Dispatch } from 'react'
import { Check, ChefHat, ChevronLeft, ChevronRight, Clock, Minus, Plus, RotateCcw, ShoppingCart, Square, BookOpen, AlertTriangle } from 'lucide-react'
import {
  servesFactor, MIN_SERVES, MAX_SERVES,
  type CookingSession, type KioskEvent, type KioskState,
} from '@/lib/wall/activity/kioskActivity'
import { formatRemaining, isTimerDone, remainingMs, timerProgress, durationsInStep, type KioskTimer } from '@/lib/wall/activity/kioskTimers'
import { grocerySummary, linesToAdd, linesToRetry, type GroceryLine, type GroceryProposal } from '@/lib/wall/activity/groceryProposal'
import { ingredientsForStep, cookingSteps, scaledLine } from '@/lib/wall/activity/cookingModel'
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
  minutes: number | null
  cue: string | null
  /** The recipe's ingredient lines, unscaled. */
  ingredients: string[]
  source: CookingSource | null
  /** The whole recipe can be opened (stored body or a link). */
  hasRecipe: boolean
  baseServes: number
}

function Photo({ url, className = '' }: { url: string | null; className?: string }) {
  return url
    ? <img src={url} alt="" className={`kc-photo ${className}`} />
    : <div aria-hidden="true" className={`kc-photo kc-photo-empty ${className}`}><ChefHat /></div>
}

export function ServesStepper({ serves, base, onChange }: { serves: number; base: number; onChange: (n: number) => void }) {
  return (
    <div className="kc-serves" role="group" aria-label="Servings">
      <button type="button" className="kc-btn kc-square" aria-label="One fewer" disabled={serves <= MIN_SERVES} onClick={() => onChange(serves - 1)}><Minus /></button>
      <div className="kc-serves-value" aria-live="polite"><strong>{serves}</strong><small>{serves === 1 ? 'person' : 'people'}</small></div>
      <button type="button" className="kc-btn kc-square" aria-label="One more" disabled={serves >= MAX_SERVES} onClick={() => onChange(serves + 1)}><Plus /></button>
      <small className="kc-serves-note">{serves === base ? `Recipe as written (${base})` : `Scaled from ${base}`}</small>
    </div>
  )
}

// ─── Dinner ────────────────────────────────────────────────────────

export function DinnerStage({ d, state, dispatch, onStartCooking, onAddMissing, onOpenRecipe }: {
  d: KioskDinner
  state: KioskState
  dispatch: Dispatch<KioskEvent>
  onStartCooking: () => void
  onAddMissing: () => void
  onOpenRecipe: () => void
}) {
  const serves = state.serves ?? d.baseServes
  const factor = servesFactor(serves, d.baseServes)
  const missing = d.ingredients.filter((_, i) => !state.have.includes(i)).length
  return (
    <div className="kc-dinner">
      <section className="kc-dinner-hero" aria-label="Tonight’s dinner">
        <Photo url={d.imageUrl} className="kc-dinner-photo" />
        <div className="kc-kicker">{d.timeLabel ?? 'Dinner tonight'}{d.minutes ? ` · ${d.minutes} min` : ''}</div>
        <h2 className="kc-title">{d.title}</h2>
        {d.cue && <p className="kc-cue"><Clock aria-hidden="true" />{d.cue}</p>}
        <ServesStepper serves={serves} base={d.baseServes} onChange={(n) => dispatch({ type: 'SET_SERVES', serves: n })} />
        <div className="kc-actions">
          {d.source
            ? <button type="button" className="kc-btn is-primary" onClick={onStartCooking}>
                {state.cooking?.key === d.key ? `Back to cooking · step ${state.cooking.step + 1}` : 'Start cooking'}
              </button>
            : <p className="kc-muted">No steps saved for this one.</p>}
          {d.ingredients.length > 0 && (
            <button type="button" className="kc-btn" onClick={onAddMissing} disabled={missing === 0}>
              <ShoppingCart aria-hidden="true" />Add what’s missing{missing ? ` · ${missing}` : ''}
            </button>
          )}
          {d.hasRecipe && <button type="button" className="kc-btn" onClick={onOpenRecipe}><BookOpen aria-hidden="true" />Whole recipe</button>}
        </div>
      </section>
      <section className="kc-card kc-ingredients" aria-label="Ingredients">
        <h3>Ingredients{factor !== 1 ? ` for ${serves}` : ''}</h3>
        <p className="kc-muted kc-small">Tap what you already have.</p>
        {d.ingredients.length === 0 && <p className="kc-muted">No ingredient list saved.</p>}
        <ul>
          {d.ingredients.map((line, i) => {
            const have = state.have.includes(i)
            const s = scaledLine(line, factor)
            return (
              <li key={i}>
                <button type="button" aria-pressed={have} className={`kc-tick-row ${have ? 'is-done' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_HAVE', index: i })}>
                  <span className="kc-tick" aria-hidden="true">{have && <Check />}</span>
                  <span>{s.text}{s.was && <small className="kc-was"> was {s.was}</small>}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

// ─── Groceries ─────────────────────────────────────────────────────

const LINE_STATE: Record<GroceryLine['state'], string> = {
  'will-add': 'Will add', skip: 'Not adding', saving: 'Saving…', added: 'Added', failed: 'Didn’t save',
}

export function GroceriesStage({ proposal, listTitle, dispatch, onSave, onRetry }: {
  proposal: GroceryProposal
  listTitle: string | null
  dispatch: Dispatch<KioskEvent>
  onSave: () => void
  onRetry: () => void
}) {
  const sum = grocerySummary(proposal)
  const toAdd = linesToAdd(proposal).length
  const toRetry = linesToRetry(proposal).length
  const list = listTitle ?? 'Groceries'
  return (
    <div className="kc-groceries">
      <div className="kc-stage-head">
        <div>
          <div className="kc-kicker">{proposal.origin === 'cooking' ? 'Out of something?' : 'What’s missing for dinner'}</div>
          <h2 className="kc-title">Add to {list}</h2>
        </div>
        <p className="kc-muted" role="status" aria-live="polite">
          {[sum.added && `${sum.added} added`, sum.saving && `${sum.saving} saving`, sum.failed && `${sum.failed} didn’t save`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <ul className="kc-grocery-lines">
        {proposal.lines.map((l) => {
          const locked = l.state === 'saving' || l.state === 'added' || l.state === 'failed'
          return (
            <li key={l.key}>
              <button type="button" aria-pressed={l.state === 'will-add'} disabled={locked}
                className={`kc-tick-row kc-grocery is-${l.state}`}
                onClick={() => dispatch({ type: 'GROCERY_TOGGLE', key: l.key })}>
                <span className="kc-tick" aria-hidden="true">{(l.state === 'will-add' || l.state === 'added') && <Check />}{l.state === 'failed' && <AlertTriangle />}</span>
                <span className="kc-grocery-text">{l.text}</span>
                <span className="kc-line-state">{l.alreadyListed ? 'Already on the list' : LINE_STATE[l.state]}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="kc-actions">
        <button type="button" className="kc-btn is-primary" disabled={!listTitle || toAdd === 0} onClick={onSave}>
          <ShoppingCart aria-hidden="true" />{toAdd ? `Add ${toAdd} to ${list}` : `Add to ${list}`}
        </button>
        {toRetry > 0 && <button type="button" className="kc-btn is-warn" onClick={onRetry}><RotateCcw aria-hidden="true" />Retry {toRetry}</button>}
        {!listTitle && <p className="kc-muted">There’s no family grocery list yet.</p>}
      </div>
    </div>
  )
}

// ─── Timers ────────────────────────────────────────────────────────

export function TimerList({ timers, nowMs, dispatch, compact = false }: { timers: KioskTimer[]; nowMs: number; dispatch: Dispatch<KioskEvent>; compact?: boolean }) {
  if (!timers.length) return null
  return (
    <ul className={`kc-timers ${compact ? 'is-compact' : ''}`} aria-label="Timers">
      {timers.map((t) => {
        const done = isTimerDone(t, nowMs)
        const pct = Math.round(timerProgress(t, nowMs) * 100)
        return (
          <li key={t.id} className={`kc-timer ${done ? 'is-done' : ''}`} style={{ ['--kc-progress' as string]: `${pct}%` }}>
            <div className="kc-timer-read" role={done ? 'alert' : undefined}>
              <span className="kc-timer-time">{done ? 'Done' : formatRemaining(remainingMs(t, nowMs))}</span>
              <span className="kc-timer-label">{t.label}</span>
            </div>
            <div className="kc-timer-actions">
              <button type="button" className="kc-btn" onClick={() => dispatch({ type: 'ADD_MINUTE', id: t.id, now: Date.now() })} aria-label={`Add a minute to ${t.label}`}>+1 min</button>
              <button type="button" className="kc-btn" onClick={() => dispatch({ type: 'STOP_TIMER', id: t.id })} aria-label={`Stop ${t.label}`}><Square aria-hidden="true" />Stop</button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Cooking ───────────────────────────────────────────────────────

function StepIngredients({ title, indices, recipe, factor }: { title: string; indices: number[]; recipe: CookingRecipe; factor: number }) {
  return (
    <div className="kc-step-ings">
      <div className="kc-kicker">{title}</div>
      {indices.length === 0
        ? <p className="kc-muted kc-small">Nothing new from the list.</p>
        : <ul>{indices.map((i) => { const s = scaledLine(recipe.ingredients[i], factor); return <li key={i}>{s.text}{s.was && <small className="kc-was"> was {s.was}</small>}</li> })}</ul>}
    </div>
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
  if (loading) return <div className="kc-empty"><ChefHat aria-hidden="true" /><p>Getting the steps for {session.title}…</p></div>
  const steps = cookingSteps(recipe?.instructions)
  if (error || !recipe || steps.length === 0) {
    return (
      <div className="kc-empty">
        <ChefHat aria-hidden="true" />
        <p>{error ? `Couldn’t load the steps: ${error}` : 'This recipe has no step-by-step directions saved.'}</p>
        <div className="kc-actions">
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
  const stepLabel = `step ${i + 1}`
  return (
    <div className="kc-cooking">
      <section className="kc-step" aria-label={`Step ${i + 1} of ${steps.length}`}>
        <div className="kc-kicker">Step {i + 1} of {steps.length}</div>
        <p className="kc-step-text" aria-live="polite">{step}</p>
        <nav className="kc-step-dots" aria-label="Steps">
          {steps.map((_, n) => (
            <button key={n} type="button" aria-label={`Go to step ${n + 1}`} aria-current={n === i ? 'step' : undefined}
              className={`kc-dot ${n === i ? 'is-current' : n < i ? 'is-past' : ''}`} onClick={() => dispatch({ type: 'GO_STEP', step: n })} />
          ))}
        </nav>
        <div className="kc-step-nav">
          <button type="button" className="kc-btn kc-big" disabled={i === 0} onClick={() => dispatch({ type: 'PREV_STEP' })}><ChevronLeft aria-hidden="true" />Back a step</button>
          {last
            ? <button type="button" className="kc-btn kc-big is-accent" onClick={() => dispatch({ type: 'FINISH_COOKING' })}><Check aria-hidden="true" />Done cooking</button>
            : <button type="button" className="kc-btn kc-big is-primary" onClick={() => dispatch({ type: 'NEXT_STEP' })}>Next step<ChevronRight aria-hidden="true" /></button>}
        </div>
      </section>
      <aside className="kc-cook-side">
        <StepIngredients title="This step" indices={usesNow} recipe={recipe} factor={factor} />
        {!last && <StepIngredients title="Next step" indices={usesNext} recipe={recipe} factor={factor} />}
        <div className="kc-timer-start">
          <div className="kc-kicker">Timers</div>
          <div className="kc-timer-presets">
            {suggested.slice(0, 2).map((m) => (
              <button key={m} type="button" className="kc-btn is-accent" onClick={() => onStartTimer(m, `${m} min · ${stepLabel}`)}>{m} min</button>
            ))}
            {[5, 10].filter((m) => !suggested.includes(m)).slice(0, suggested.length ? 1 : 2).map((m) => (
              <button key={m} type="button" className="kc-btn" onClick={() => onStartTimer(m, `${m} min · ${stepLabel}`)}>{m} min</button>
            ))}
          </div>
          <TimerList timers={timers} nowMs={nowMs} dispatch={dispatch} />
        </div>
        <button type="button" className="kc-btn" onClick={onOutOfSomething}><ShoppingCart aria-hidden="true" />Out of something?</button>
      </aside>
    </div>
  )
}

/** What stays visible while another activity has the stage. */
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
    <aside className="kc-held" aria-label={session ? 'Cooking, held' : 'Timers'}>
      {session && (
        <>
          <div className="kc-kicker">Held · cooking</div>
          <h3>{session.title}</h3>
          <div className="kc-held-step">
            <strong>Step {session.step + 1}{session.stepCount ? ` of ${session.stepCount}` : ''}</strong>
            {step && <p>{step}</p>}
          </div>
        </>
      )}
      {!session && <div className="kc-kicker">Timers</div>}
      <TimerList timers={timers} nowMs={nowMs} dispatch={dispatch} compact />
      {session && <button type="button" className="kc-btn is-primary" onClick={() => dispatch({ type: 'RESUME_COOKING' })}>Back to cooking</button>}
    </aside>
  )
}

// ─── Leaving ───────────────────────────────────────────────────────

const KIND_LABEL = { do: 'Do', bring: 'Bring', homework: 'Homework' } as const

export function DepartureStage({ model, nowMs, dispatch }: { model: DepartureModel; nowMs: number; dispatch: Dispatch<KioskEvent> }) {
  const now = new Date(nowMs)
  return (
    <div className="kc-departure">
      <div className="kc-stage-head">
        <div>
          <div className="kc-kicker">{model.done} of {model.total} ready</div>
          <h2 className="kc-title">Out the door</h2>
        </div>
        {model.at && (
          <div className="kc-countdown" aria-live="polite">
            <strong>{countdownLabel(model.at, now)}</strong>
            <small>{model.atLabel} (start time — no travel time saved)</small>
          </div>
        )}
      </div>
      <div className="kc-people-cols" style={{ ['--kc-cols' as string]: String(Math.max(1, model.people.length)) }}>
        {model.people.map((p) => (
          <section key={p.memberId} className="kc-card kc-person-col" aria-label={p.name}>
            <h3>{p.name}</h3>
            {p.items.length === 0 && <p className="kc-muted">Nothing to remember.</p>}
            <ul>
              {p.items.map((it) => (
                <li key={it.key}>
                  <button type="button" aria-pressed={it.done} className={`kc-tick-row kc-big-tick ${it.done ? 'is-done' : ''}`} onClick={() => dispatch({ type: 'DEPARTURE_TOGGLE', key: it.key })}>
                    <span className="kc-tick" aria-hidden="true">{it.done && <Check />}</span>
                    <span><small className="kc-kicker">{KIND_LABEL[it.kind]}</small>{it.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="kc-actions">
        <button type="button" className="kc-btn is-accent kc-wide" onClick={() => dispatch({ type: 'DEPARTURE_DONE' })}><Check aria-hidden="true" />Everyone’s out</button>
        <p className="kc-muted kc-small">Ticks here are packing marks on this wall; they don’t complete anyone’s tasks.</p>
      </div>
    </div>
  )
}

// ─── Bedtime ───────────────────────────────────────────────────────

export function BedtimeStage({ grid, onTick }: { grid: BedtimeGrid; onTick: (memberId: string, row: KidRow) => void }) {
  if (grid.people.length === 0) {
    return <div className="kc-empty"><p>No bedtime routine tonight.</p></div>
  }
  return (
    <div className="kc-bedtime">
      <div className="kc-stage-head">
        <div>
          <div className="kc-kicker">{grid.done} of {grid.total} done</div>
          <h2 className="kc-title">{grid.title}</h2>
        </div>
      </div>
      <div className="kc-grid-wrap">
        <table className="kc-bed-grid">
          <thead>
            <tr><th scope="col"><span className="sr-only">Step</span></th>{grid.people.map((p) => <th key={p.id} scope="col">{p.name}</th>)}</tr>
          </thead>
          <tbody>
            {grid.steps.map((s) => (
              <tr key={s.key}>
                <th scope="row">{s.title}</th>
                {s.cells.map((c) => {
                  const name = grid.people.find((p) => p.id === c.memberId)?.name ?? ''
                  return (
                    <td key={c.memberId}>
                      {c.row
                        ? <button type="button" aria-pressed={c.row.done} aria-label={`${name}: ${s.title}`} className={`kc-cell ${c.row.done ? 'is-done' : ''}`} onClick={() => onTick(c.memberId, c.row!)}>
                            {c.row.done ? <Check aria-hidden="true" /> : null}
                          </button>
                        : <span className="kc-cell-none" aria-label={`${name}: not in their routine`}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
