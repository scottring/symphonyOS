// The household kiosk as an activity canvas (conversational canvas, slice 7).
//
//   top band   clock · date · weather  |  PLACE (the activity)  |  Household
//   stage      the one activity on screen; a held column beside it when
//              cooking or timers are held behind another activity
//   bottom bar Home · Back · held chips · Tell Symphony · NEXT
//
// The band and bar never move; only the stage recomposes. Presentation and
// orchestration only: the Shell owns data, permissions and writes, and hands
// in rows that are already filtered for a shared display (family context;
// one adult's own tasks dropped by wallTodayRows). Nothing here adds a query.

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ArrowLeft, Home, Users, ChevronRight, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow, WallChecklist } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import type { ComingUpRow } from '../wallStrip'
import type { MomentKid, MomentHandoff } from '../moments/WallMoments'
import type { MomentScratchpad } from '../moments/ScratchpadCard'
import { usePlaceOrDefault } from '@/hooks/usePlace'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'
import { sceneryArt } from '@/components/place/panoramas'
import {
  currentStage, heldChips, kioskPlace, servesFactor,
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
import { WallV2PhoneScreen } from '../WallV2PhoneScreen'

export interface KioskCanvasProps {
  isDark: boolean
  activity: KioskActivity
  now: Date
  moment: WallMoment
  dateLabel: string
  clock: string
  weather: { icon: LucideIcon; temp: number; condition: string } | null
  freshness?: ReactNode
  /** Household tools for the Home stage: kidsPhone, Groceries, Recipes, … */
  tools: ReactNode
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
  scratchpad: MomentScratchpad
  question: { text: string; isHandoff: boolean } | null
  groceryListTitle: string | null
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

  const place = kioskPlace(state, {
    daypartLabel: comp.label,
    dinnerTitle: p.dinner?.title ?? null,
    recipeTitle: p.recipeTitle,
    departureLabel: departure.label,
    memberName: (id) => memberById(id)?.name ?? null,
  })
  const chips = heldChips(state, nowMs, hold)
  const next = nextCommitment(p.rows, p.now)
  const showHeld = stage.kind !== 'cooking' && (!!state.cooking || state.timers.length > 0)

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

  let content: ReactNode
  switch (stage.kind) {
    case 'home':
      content = (
        <KioskHome
          comp={comp} now={p.now} members={p.members} rows={p.homeRows} kidsNow={p.kidsNow} focusRows={p.focusRows}
          handoffs={p.handoffs} checklists={p.checklists} dinner={p.dinner} nextMeal={p.nextMeal} comingUp={p.comingUp}
          scratchpad={p.scratchpad} question={p.question} bedtime={p.bedtime} tools={p.tools}
          onTapRow={p.onTapRow} onTick={p.onTick} onClaim={p.onClaim} onTapQuestion={p.onTapQuestion}
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
        ? <DinnerStage d={p.dinner} state={state} dispatch={dispatch}
            onStartCooking={() => { const said = startCooking(); if (said.startsWith('No')) p.flash(said) }}
            onAddMissing={() => { const said = addMissing(); if (said === 'Nothing missing') p.flash(said) }}
            onOpenRecipe={p.onOpenRecipe} />
        : <div className="kc-empty"><p>No dinner planned tonight.</p></div>
      break
    case 'groceries':
      content = state.groceries
        ? <GroceriesStage proposal={state.groceries} listTitle={p.groceryListTitle} dispatch={dispatch}
            onSave={() => { void save(linesToAdd(state.groceries!)) }}
            onRetry={() => { void save(linesToRetry(state.groceries!)) }} />
        : <div className="kc-empty"><p>Nothing to add.</p></div>
      break
    case 'cooking':
      content = state.cooking
        ? <CookingStage session={state.cooking} recipe={recipe} loading={loading} error={error} timers={state.timers} nowMs={nowMs}
            dispatch={dispatch} onStartTimer={startTimer} onOutOfSomething={outOfSomething}
            onOpenRecipe={p.onOpenRecipe} />
        : <div className="kc-empty"><p>Nothing is cooking.</p></div>
      break
    case 'departure':
      content = <DepartureStage model={departure} nowMs={nowMs} dispatch={dispatch} />
      break
    case 'bedtime':
      content = <BedtimeStage grid={p.bedtime} onTick={(id, row) => { const m = memberById(id); if (m) p.onTick(m, row) }} />
      break
    case 'calling':
      content = <WallV2PhoneScreen embedded onClose={() => dispatch({ type: 'BACK' })} />
      break
    case 'person':
      content = p.personPage
      break
    case 'recipe':
      content = p.recipePage
      break
  }

  const W = p.weather
  return (
    <div className={`kiosk-canvas ${p.isDark ? 'is-dark' : ''}`} onPointerDownCapture={touched} data-stage={stage.kind}>
      <header className="kc-top">
        <div className="kc-time">
          <span className="kc-clock">{p.clock}</span>
          <span className="kc-date">{p.dateLabel}{W && <span className="kc-weather" title={W.condition}><W.icon aria-hidden="true" />{Math.round(W.temp)}°</span>}</span>
          {p.freshness}
        </div>
        <h1 className="kc-place" ref={placeRef} tabIndex={-1} aria-live="polite">{place}</h1>
        <span className="kc-context"><Users aria-hidden="true" />Household</span>
      </header>

      <div className="kc-stage" data-held={showHeld ? 'true' : 'false'}>
        <main className={`kc-main is-${stage.kind} ${stage.kind === 'home' ? `part-${comp.part}` : ''}`}>
          {scenery.showScenery && stage.kind === 'home' && (
            <div className={`kc-scenery ${comp.part === 'quiet' ? 'is-hero' : ''}`} aria-hidden="true"><img src={art.src} alt="" /></div>
          )}
          <div className="kc-main-inner">{content}</div>
        </main>
        {showHeld && <HeldColumn session={state.cooking} recipe={recipe} timers={state.timers} nowMs={nowMs} dispatch={dispatch} />}
      </div>

      <nav className="kc-bar" aria-label="Kiosk">
        <button type="button" className="kc-btn kc-nav" onClick={() => dispatch({ type: 'HOME' })} aria-current={stage.kind === 'home' ? 'page' : undefined}><Home aria-hidden="true" />Home</button>
        <button type="button" className="kc-btn kc-nav" onClick={() => dispatch({ type: 'BACK' })} disabled={state.stack.length < 2}><ArrowLeft aria-hidden="true" />Back</button>
        <div className="kc-chips-held" aria-label="Held activities">
          {chips.map((c) => {
            const body = <>{c.timer && <Timer aria-hidden="true" />}<span>{c.label}{c.timer ? ` · ${c.timer}` : ''}</span></>
            if (c.kind === 'timer') return <span key={c.kind} className={`kc-held-chip ${c.ringing ? 'is-ringing' : ''}`} role="status">{body}</span>
            const kind = c.kind
            const go = () => {
              if (kind === 'cooking') dispatch({ type: 'RESUME_COOKING' })
              else dispatch({ type: 'OPEN', stage: { kind } })
            }
            return <button key={c.kind} type="button" className={`kc-held-chip ${c.ringing ? 'is-ringing' : ''}`} onClick={go}>{body}<ChevronRight aria-hidden="true" /></button>
          })}
        </div>
        <KioskTellSymphony onCommand={runCommand} />
        <div className="kc-next" aria-label="Next">
          <small>Next</small>
          {next
            ? <strong>{next.time} {next.title}{next.owners.length ? ` · ${next.owners.map((id) => memberById(id)?.name).filter(Boolean).join(', ')}` : ''}</strong>
            : <strong className="kc-muted">Nothing else today</strong>}
        </div>
      </nav>
    </div>
  )
}
