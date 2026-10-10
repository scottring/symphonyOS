// The household kiosk as an activity canvas (conversational canvas, slice 7).
//
//   top band   clock + date  |  YOU ARE IN · the activity  |  weather · Household
//   stage      the one activity on screen; when cooking or timers are held
//              behind another activity, the held column sits at its left
//   bottom bar Home · Back · held chips · Call · Groceries · Recipes · More ·
//              Tell Symphony · NEXT
//
// Layout follows the approved kiosk boards (Kiosk-Frame and the eleven
// activity boards) in the wall's own themes: light by default, the warm dark
// view when the wall is switched to it (More → Dark view).
//
// The band and bar never move; only the stage recomposes. Presentation and
// orchestration only: the Shell owns data, permissions and writes, and hands
// in rows that are already filtered for a shared display (family context;
// one adult's own tasks dropped by wallTodayRows). Nothing here adds a query.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Home, ChevronRight, Timer, Phone, ShoppingCart, ChefHat, MoreHorizontal, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow, WallChecklist } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { ComingUpRow } from '../wallStrip'
import type { MomentKid, MomentHandoff } from '../moments/WallMoments'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'
import { sceneryArt } from '@/components/place/panoramas'
import {
  currentStage, heldChips, kioskPlaceWithHold, servesFactor, showsHeldColumn,
} from '@/lib/wall/activity/kioskActivity'
import { kioskComposition, nextCommitment } from '@/lib/wall/activity/kioskCompose'
import { buildDeparture, type BedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { proposeGroceries, linesToAdd, linesToRetry, type GroceryLine, type GroceryLineResult } from '@/lib/wall/activity/groceryProposal'
import { soonestTimer } from '@/lib/wall/activity/kioskTimers'
import { isIngredientLine, scaledLine, cookingSteps } from '@/lib/wall/activity/cookingModel'
import type { KioskCommand } from '@/lib/wall/activity/kioskCommands'
import type { KioskActivity } from './useKioskActivity'
import { useCookingRecipe } from './useCookingRecipe'
import { KioskTellSymphony } from './KioskTellSymphony'
import { KioskHome } from './KioskHome'
import {
  BedtimeStage, CookingStage, DepartureStage, DinnerStage, GroceriesStage, HeldColumn, type KioskDinner,
} from './KioskStages'
import { WallV2PhoneScreen, type PhoneFixture } from '../WallV2PhoneScreen'

/** The household tools in the bottom bar. Call is the canvas's own (it opens
 *  the Calling activity); the rest are the Shell's sheets. */
export interface KioskTools {
  onGroceries: () => void
  onRecipes: () => void
  /** Secondary actions, behind one labelled More button. */
  more: { id: string; label: string; sub?: string; icon: LucideIcon; onSelect: () => void }[]
}

export interface KioskCanvasProps {
  isDark: boolean
  activity: KioskActivity
  now: Date
  moment: WallMoment
  dateLabel: string
  clock: string
  weather: { icon: LucideIcon; temp: number; condition: string } | null
  freshness?: ReactNode
  tools: KioskTools
  members: FamilyMember[]
  /** Today's rows, already privacy-filtered (wallTodayRows). */
  rows: WallTodayRow[]
  /** The same rows minus what After school already lists. */
  homeRows: WallTodayRow[]
  kidsNow: MomentKid[]
  focusRows: WallTodayRow[]
  handoffs: MomentHandoff[]
  checklists: { member: FamilyMember; list: WallChecklist | null; live?: string | null }[]
  bedtime: BedtimeGrid
  dinner: KioskDinner | null
  nextMeal: { label: string; title: string; imageUrl: string | null; onOpen?: () => void } | null
  comingUp: ComingUpRow[]
  question: { text: string; isHandoff: boolean } | null
  groceryListTitle: string | null
  /** The grocery list's open items, shown beside a proposal ("where they'll go"). */
  groceryListItems?: string[] | null
  /** Fixed phone-book contacts for design previews (never dials). */
  phoneFixture?: PhoneFixture
  /** Idempotent save of grocery lines (saveGroceryLines over the family list). */
  saveGroceries: (lines: GroceryLine[]) => Promise<GroceryLineResult[]>
  /** A person's day page (KidDayView) when the stage is a person. */
  personPage: ReactNode
  /** The recipe viewer when the stage is a recipe, and its title. */
  recipePage: ReactNode
  recipeTitle: string | null
  onOpenRecipe: () => void
  onTapRow: (id: string) => void
  onTick: (member: FamilyMember, row: KidRow) => void
  onClaim: () => void
  onTapQuestion: () => void
  /** A short confirmation on the wall's flash line. */
  flash: (msg: string) => void
}

export function KioskCanvas(p: KioskCanvasProps) {
  const { state, dispatch, nowMs, touched } = p.activity
  const stage = currentStage(state)
  const comp = useMemo(() => kioskComposition(p.moment, p.now), [p.moment, p.now])
  const hold = useMemo(() => ({ bedtimeInProgress: p.bedtime.inProgress }), [p.bedtime.inProgress])
  const { setHold } = p.activity
  useEffect(() => { setHold(hold) }, [hold, setHold])
  const memberById = useCallback((id: string) => p.members.find((m) => m.id === id) ?? null, [p.members])

  // Cooking's recipe loads whenever a session exists (on stage or held), so
  // the held column can show the step and a reload restores it.
  const cookingSource = state.cooking?.source ?? null
  const { recipe, loading, error } = useCookingRecipe(cookingSource)
  const steps = useMemo(() => cookingSteps(recipe?.instructions), [recipe])
  useEffect(() => {
    if (state.cooking && recipe && state.cooking.stepCount !== steps.length) {
      dispatch({ type: 'STEPS_LOADED', key: state.cooking.key, stepCount: steps.length })
    }
  }, [state.cooking, recipe, steps.length, dispatch])

  const departure = useMemo(
    () => buildDeparture(p.kidsNow, p.rows, new Date(nowMs), state.departure.checked),
    [p.kidsNow, p.rows, nowMs, state.departure.checked],
  )

  const place = kioskPlaceWithHold(state, {
    daypartLabel: comp.label,
    dinnerTitle: p.dinner?.title ?? null,
    recipeTitle: p.recipeTitle,
    departureLabel: departure.label,
    memberName: (id) => memberById(id)?.name ?? null,
  })
  const chips = heldChips(state, nowMs, hold)
  const next = nextCommitment(p.rows, p.now)
  const showHeld = showsHeldColumn(state)
  const [moreOpen, setMoreOpen] = useState(false)

  // ─── Commands: buttons, typing and speech all land here ───
  const startCooking = useCallback((): string => {
    const d = p.dinner
    if (!d?.source || !d.key) return 'No recipe steps saved for tonight'
    dispatch({ type: 'START_COOKING', key: d.key, title: d.title, source: d.source, baseServes: d.baseServes, now: Date.now() })
    return `Cooking ${d.title}`
  }, [p.dinner, dispatch])

  const addMissing = useCallback((): string => {
    const d = p.dinner
    if (!d || d.ingredients.length === 0) return 'No ingredient list for tonight'
    const factor = servesFactor(state.serves ?? d.baseServes, d.baseServes)
    const texts = d.ingredients.filter((_, i) => !state.have.includes(i)).map((l) => scaledLine(l, factor).text)
    if (!texts.length) return 'Nothing missing'
    dispatch({ type: 'GROCERY_PROPOSE', proposal: proposeGroceries(texts, 'dinner') })
    return `${texts.length} to check`
  }, [p.dinner, state.serves, state.have, dispatch])

  const outOfSomething = useCallback(() => {
    if (!state.cooking || !recipe) return
    const factor = servesFactor(state.cooking.serves, state.cooking.baseServes)
    const texts = recipe.ingredients.filter(isIngredientLine).map((l) => scaledLine(l, factor).text)
    dispatch({ type: 'GROCERY_PROPOSE', proposal: proposeGroceries(texts, 'cooking', false) })
  }, [state.cooking, recipe, dispatch])

  const startTimer = useCallback((minutes: number, label: string) => {
    dispatch({ type: 'START_TIMER', id: `t${Date.now().toString(36)}${Math.round(minutes)}`, label, minutes, now: Date.now() })
  }, [dispatch])

  const runCommand = useCallback((c: KioskCommand): string => {
    switch (c.type) {
      case 'show-dinner':
        if (!p.dinner) return 'No dinner planned tonight'
        dispatch({ type: 'OPEN', stage: { kind: 'dinner' } })
        return `Dinner: ${p.dinner.title}`
      case 'set-serves':
        dispatch({ type: 'SET_SERVES', serves: c.serves })
        if (stage.kind !== 'cooking' && stage.kind !== 'dinner' && p.dinner) dispatch({ type: 'OPEN', stage: { kind: 'dinner' } })
        return `Serving ${c.serves}`
      case 'add-missing':
        return addMissing()
      case 'start-cooking':
        return startCooking()
      case 'next-step':
      case 'prev-step':
        if (!state.cooking) return 'Nothing is cooking'
        if (stage.kind !== 'cooking') dispatch({ type: 'RESUME_COOKING' })
        dispatch({ type: c.type === 'next-step' ? 'NEXT_STEP' : 'PREV_STEP' })
        return c.type === 'next-step' ? 'Next step' : 'Previous step'
      case 'start-timer': {
        const label = state.cooking ? `${c.minutes} min · step ${state.cooking.step + 1}` : `${c.minutes} min`
        startTimer(c.minutes, label)
        return `Timer · ${c.minutes} min`
      }
      case 'stop-timer': {
        const t = soonestTimer(state.timers, Date.now())
        if (!t) return 'No timer running'
        dispatch({ type: 'STOP_TIMER', id: t.id })
        return `Stopped ${t.label}`
      }
      case 'resume-cooking':
        if (!state.cooking) return 'Nothing is cooking'
        dispatch({ type: 'RESUME_COOKING' })
        return 'Back to cooking'
      case 'home':
        dispatch({ type: 'HOME' })
        return 'Home'
      case 'back':
        dispatch({ type: 'BACK' })
        return 'Back'
    }
  }, [p.dinner, stage.kind, state.cooking, state.timers, addMissing, startCooking, startTimer, dispatch])

  const save = useCallback(async (lines: GroceryLine[]) => {
    if (!lines.length) return
    dispatch({ type: 'GROCERY_SAVING', keys: lines.map((l) => l.key) })
    let results: GroceryLineResult[]
    try { results = await p.saveGroceries(lines) } catch { results = lines.map((l) => ({ key: l.key, ok: false })) }
    dispatch({ type: 'GROCERY_RESULTS', results })
    const ok = results.filter((r) => r.ok).length
    const failed = results.length - ok
    p.flash(failed ? `${ok} added · ${failed} didn’t save` : `Added ${ok} to ${p.groceryListTitle ?? 'Groceries'}`)
  }, [p, dispatch])

  // Move focus to the place when the activity changes, so a screen reader
  // (and a keyboard in dev) follows the stage.
  const placeRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) placeRef.current?.focus()
    mounted.current = true
  }, [stage.kind])

  const placeId = usePlaceOrDefault()
  const scenery = useSceneryPreferences()
  const art = sceneryArt(scenery.sceneryStyle, placeId, p.isDark && scenery.lightingChoice === 'auto' ? 'nighttime' : scenery.sceneryLighting)

  const sceneryBand = scenery.showScenery && stage.kind === 'home' && comp.part !== 'quiet'

  let content: ReactNode
  switch (stage.kind) {
    case 'home':
      content = (
        <KioskHome
          comp={comp} now={p.now} members={p.members} rows={p.homeRows} kidsNow={p.kidsNow} focusRows={p.focusRows}
          handoffs={p.handoffs} checklists={p.checklists} dinner={p.dinner} nextMeal={p.nextMeal} comingUp={p.comingUp}
          question={p.question} bedtime={p.bedtime} departure={departure} next={next}
          onTapRow={p.onTapRow} onTick={p.onTick} onClaim={p.onClaim} onTapQuestion={p.onTapQuestion}
          onToggleDeparture={(key) => dispatch({ type: 'DEPARTURE_TOGGLE', key })}
          onOpenKid={(m) => dispatch({ type: 'OPEN', stage: { kind: 'person', memberId: m.id } })}
          onOpenDinner={() => dispatch({ type: 'OPEN', stage: { kind: 'dinner' } })}
          onStartCooking={() => { const said = startCooking(); if (said.startsWith('No')) p.flash(said) }}
          onStartDeparture={() => dispatch({ type: 'OPEN', stage: { kind: 'departure' } })}
          onStartBedtime={() => dispatch({ type: 'OPEN', stage: { kind: 'bedtime' } })}
        />
      )
      break
    case 'dinner':
      content = p.dinner
        ? <DinnerStage d={p.dinner} state={state} nowMs={nowMs} dispatch={dispatch}
            onStartCooking={() => { const said = startCooking(); if (said.startsWith('No')) p.flash(said) }}
            onAddMissing={() => { const said = addMissing(); if (said === 'Nothing missing') p.flash(said) }}
            onOpenRecipe={p.onOpenRecipe} />
        : <div className="kc-card kc-fill"><p className="kc-quiet-line">No dinner planned tonight.</p></div>
      break
    case 'groceries': {
      const g = state.groceries
      const ctx = g?.origin === 'cooking' && state.cooking
        ? { title: state.cooking.title, imageUrl: p.dinner?.key === state.cooking.key ? p.dinner.imageUrl : null, sub: `For ${state.cooking.serves} · step ${state.cooking.step + 1}` }
        : p.dinner ? { title: p.dinner.title, imageUrl: p.dinner.imageUrl, sub: [`For ${state.serves ?? p.dinner.baseServes}`, p.dinner.minutes ? `${p.dinner.minutes} min` : null].filter(Boolean).join(' · ') } : null
      content = g
        ? <GroceriesStage proposal={g} listTitle={p.groceryListTitle} listItems={p.groceryListItems ?? null} context={ctx} compact={showHeld} dispatch={dispatch}
            onSave={() => { void save(linesToAdd(g)) }}
            onRetry={() => { void save(linesToRetry(g)) }} />
        : <div className="kc-card kc-fill"><p className="kc-quiet-line">Nothing to add.</p></div>
      break
    }
    case 'cooking':
      content = state.cooking
        ? <CookingStage session={state.cooking} recipe={recipe} loading={loading} error={error} timers={state.timers} nowMs={nowMs}
            dispatch={dispatch} onStartTimer={startTimer} onOutOfSomething={outOfSomething}
            onOpenRecipe={p.onOpenRecipe} />
        : <div className="kc-card kc-fill"><p className="kc-quiet-line">Nothing is cooking.</p></div>
      break
    case 'departure':
      content = <DepartureStage model={departure} nowMs={nowMs} dispatch={dispatch} onOpenPerson={(id) => dispatch({ type: 'OPEN', stage: { kind: 'person', memberId: id } })} />
      break
    case 'bedtime':
      content = <BedtimeStage grid={p.bedtime} onTick={(id, row) => { const m = memberById(id); if (m) p.onTick(m, row) }} />
      break
    case 'calling':
      content = <WallV2PhoneScreen embedded fixture={p.phoneFixture} onClose={() => dispatch({ type: 'BACK' })} />
      break
    case 'person':
      content = p.personPage
      break
    case 'recipe':
      content = p.recipePage
      break
  }

  const W = p.weather
  const bottomTool = (label: string, sub: string | null, Icon: LucideIcon, onClick: () => void, aria?: string, active = false) => (
    <button type="button" className={`kc-tool ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={aria ?? label} aria-current={active ? 'page' : undefined}>
      <Icon aria-hidden="true" /><span>{label}</span>{sub && <small>{sub}</small>}
    </button>
  )
  return (
    <div className={`kiosk-canvas ${p.isDark ? 'is-dark' : ''}`} onPointerDownCapture={touched} data-stage={stage.kind}>
      <header className="kc-top">
        <div className="kc-time">
          <img className="kc-mark" src="/symphony-logo.png" alt="Symphony" />
          <div><b className="kc-clock">{p.clock}</b><span className="kc-date">{p.dateLabel}</span></div>
          {p.freshness}
        </div>
        <div className="kc-place-wrap">
          <small aria-hidden="true">YOU ARE IN</small>
          <h1 className="kc-place" ref={placeRef} tabIndex={-1} aria-live="polite">{place}</h1>
        </div>
        <div className="kc-top-right">
          {W && <span className="kc-weather" title={W.condition}><W.icon aria-hidden="true" />{Math.round(W.temp)}° · {W.condition.toLowerCase()}</span>}
          <span className="kc-context"><Home aria-hidden="true" />Household</span>
        </div>
      </header>

      <div className={`kc-stage ${showHeld ? 'is-held' : ''}`}>
        {showHeld && <HeldColumn session={state.cooking} recipe={recipe} timers={state.timers} nowMs={nowMs} dispatch={dispatch} />}
        <main className={`kc-main is-${stage.kind} ${stage.kind === 'home' ? `part-${comp.part}` : ''} ${sceneryBand ? 'has-band' : ''}`}>
          {scenery.showScenery && stage.kind === 'home' && comp.part === 'quiet' && (
            <div className="kc-scenery" aria-hidden="true"><img src={art.src} alt="" /></div>
          )}
          <div className="kc-main-inner">{content}</div>
          {/* Idle home screens keep a low band of the place's scenery under
              the cards, so the kiosk always reads as this place (2026-10-10). */}
          {sceneryBand && <div className="kc-scenery-band" aria-hidden="true"><img src={art.src} alt="" /></div>}
        </main>
      </div>

      <nav className="kc-bar" aria-label="Kiosk">
        <button type="button" className="kc-nb" onClick={() => dispatch({ type: 'HOME' })} aria-current={stage.kind === 'home' ? 'page' : undefined}><Home aria-hidden="true" />Home</button>
        <button type="button" className="kc-nb" onClick={() => dispatch({ type: 'BACK' })} disabled={state.stack.length < 2}><ArrowLeft aria-hidden="true" />Back</button>
        <div className="kc-chips-held" aria-label="Held activities">
          {chips.map((c) => {
            const body = <>{c.timer && <Timer aria-hidden="true" />}<span>{c.label}</span>{c.timer && <b>{c.timer}</b>}</>
            if (c.kind === 'timer') return <span key={c.kind} className={`kc-held-chip ${c.ringing ? 'is-ringing' : ''}`} role="status">{body}</span>
            const kind = c.kind
            const go = () => {
              if (kind === 'cooking') dispatch({ type: 'RESUME_COOKING' })
              else dispatch({ type: 'OPEN', stage: { kind } })
            }
            return <button key={c.kind} type="button" className={`kc-held-chip ${c.ringing ? 'is-ringing' : ''}`} onClick={go} aria-label={`${c.label}${c.timer ? ` · ${c.timer}` : ''}`}>{body}<ChevronRight aria-hidden="true" /></button>
          })}
        </div>
        <div className="kc-tools" role="group" aria-label="Household tools">
          {bottomTool('Call', 'kidsPhone', Phone, () => dispatch({ type: 'OPEN', stage: { kind: 'calling' } }), 'Call — kidsPhone', stage.kind === 'calling')}
          {bottomTool('Groceries', null, ShoppingCart, p.tools.onGroceries)}
          {bottomTool('Recipes', null, ChefHat, p.tools.onRecipes)}
          {bottomTool('More', null, MoreHorizontal, () => setMoreOpen((o) => !o), 'More', moreOpen)}
        </div>
        <KioskTellSymphony onCommand={runCommand} />
        <div className="kc-next" aria-label="Next">
          <small>NEXT</small>
          {next
            ? <b>{next.time} · {next.title}{next.owners.length ? ` · ${next.owners.map((id) => memberById(id)?.name).filter(Boolean).join(', ')}` : ''}</b>
            : <b className="kc-muted">Nothing else today</b>}
        </div>
        {moreOpen && (
          <div className="kc-sheet" role="dialog" aria-label="More">
            <div className="kc-sheet-head">
              <h2>More</h2>
              <button type="button" className="kc-btn kc-icon-btn" aria-label="Close More" onClick={() => setMoreOpen(false)}><X aria-hidden="true" /></button>
            </div>
            <div className="kc-sheet-grid">
              {p.tools.more.map(({ id, label, sub, icon: Icon, onSelect }) => (
                <button key={id} type="button" className="kc-sheet-btn" onClick={() => { setMoreOpen(false); onSelect() }}>
                  <Icon aria-hidden="true" /><span><b>{label}</b>{sub && <small>{sub}</small>}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}
