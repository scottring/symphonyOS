// The household kiosk as an activity canvas (conversational canvas, slice 7).
//
//   top band   clock + date  |  YOU ARE IN · the activity  |  weather · Household
//   stage      the one activity on screen; when cooking or timers are held
//              behind another activity, the held column sits at its left
//   bottom bar Home · Back · held chips · Call · Groceries · Recipes · More ·
//              Tell Symphony · NEXT
//
// The live wall (v1 data) draws Kitchen wall v2 (mockup approved 2026-10-14):
// a top band (clock · date · weather · the moment), the stage, and the
// conversation dock (KioskDock) as the only bottom bar; More takes the
// stage's side column in place (KioskMorePanel). The frame above is the
// slice-7 canvas, kept for the design previews.
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
import { ArrowLeft, Home, ChevronRight, Timer, Phone, ShoppingCart, ChefHat, MoreHorizontal, X, Mic, MicOff, CalendarDays, BookOpen, Calculator, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow, WallChecklist } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import { sceneTitle, type KioskScreen } from '@/lib/wall/activity/kioskScreen'
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
import { soonestTimer, isTimerDone } from '@/lib/wall/activity/kioskTimers'
import { doneAnnouncement, finishedLive } from '@/lib/wall/activity/kioskAlarm'
import { speechFor } from '@/lib/wall/voice/wallVoiceActions'
import { isIngredientLine, scaledLine, cookingSteps } from '@/lib/wall/activity/cookingModel'
import type { KioskCommand } from '@/lib/wall/activity/kioskCommands'
import type { KioskActivity } from './useKioskActivity'
import { useCookingRecipe } from './useCookingRecipe'
import { TellSymphonyPill, type WallVoice } from './KioskTellSymphony'
import { useTellSymphony, type ListenerPreview } from './useTellSymphony'
import { KioskDock, KioskMorePanel, type MoreTile } from './KioskDock'
import { dockCopy } from '@/lib/wall/activity/dockCopy'
import { talkUsesBand } from '@/lib/wall/wallTalk'
import { localYmd } from '@/lib/cadence/config'
import { WallConversation, WallTalkLead, WallTalkStage, type WallTalkWeek } from './WallTalk'
import { KioskHome } from './KioskHome'
import { KioskHomeV1, type KioskHomeV1Props } from './KioskHomeV1'
import {
  BedtimeStage, CookingStage, DepartureStage, DinnerStage, GroceriesStage, HeldColumn, type KioskDinner,
} from './KioskStages'
import { WallV2PhoneScreen, type PhoneFixture } from '../WallV2PhoneScreen'
import { MathStage } from './MathStage'
import type { KidMath } from '@/hooks/useKidMath'
import { EnergyStage } from './EnergyStage'
import { WebAppStage } from './WebAppStage'
import { AgendaStage, AgendaViews } from './AgendaStage'
import { StickySheet, StickyStrip } from './KioskStickies'
import { datesLabel, weekendDates, type AgendaDay, type AgendaRow, type AgendaView } from '@/lib/wall/wallAgenda'
import { formatWatts, hasReading, type EnergyLive, type EnergyPeriod } from '@/lib/wall/energy/homeEnergy'
import { planWeek } from '@/lib/wall/wallDates'

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
  /** Ticks a task or routine on the day's lists off. */
  onCompleteRow?: (id: string) => void
  /** All of today · This weekend (the dock's Today), and its checks both ways. */
  agenda?: Record<AgendaView, AgendaDay[]>
  onSetDone?: (row: AgendaRow, done: boolean) => void
  /** Saves a sticky for Home: its words and who it's from (a member id). */
  onAddSticky?: (text: string, by: string | null) => Promise<boolean>
  onTick: (member: FamilyMember, row: KidRow) => void
  onClaim: () => void
  onTapQuestion: () => void
  /** A short confirmation on the wall's flash line. */
  flash: (msg: string) => void
  /** Sentences said to the wall: what it can save and what it knows. */
  voice?: WallVoice
  /** Wall v1 (2026-10-13): the Home screens chosen from the household's
   *  routines, the trimmed bar and automatic dark. Without it, the slice-7 Home. */
  v1?: KioskV1Data
  /** Design previews only: hold the listener in one state. */
  listenerPreview?: ListenerPreview
  /** The family's next seven days and what the wall knows of a task, for the
   *  conversation's pictures (Kitchen wall v2, stage 3). */
  week?: WallTalkWeek
  /** Math of the day: each kid's problem, streak and the writes (useKidMath). */
  math?: KidMath
  /** The house's power from the wall Pi's home-energy bridge (useHomeEnergy);
   *  null where there's no bridge, which hides the Energy tile. */
  energy?: EnergyLive | null
  /** A period's totals for the Energy stage's Today / 7 days / 30 days. */
  loadEnergyPeriod?: (days: number) => Promise<EnergyPeriod>
}

const V2_FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..600&family=Instrument+Sans:wght@400;500;600;700&display=swap'
/** Kitchen wall v2's faces, loaded once when the v1 wall mounts. */
function useWallFonts(on: boolean) {
  useEffect(() => {
    if (!on || import.meta.env.MODE === 'test' || typeof document === 'undefined' || document.getElementById('kw-fonts')) return
    const link = document.createElement('link')
    link.id = 'kw-fonts'
    link.rel = 'stylesheet'
    link.href = V2_FONTS
    document.head.appendChild(link)
  }, [on])
}

/** What the Shell hands the v1 Home; the canvas adds the handlers. */
export type KioskV1Data = Pick<KioskHomeV1Props, 'pick' | 'anchors' | 'kids' | 'restLine' | 'restSub' | 'notes' | 'talks' | 'question' | 'tomorrow' | 'weekend' | 'onAnotherQuestion'> & {
  onNotes: () => void
  /** The day's scenes, for picking one by hand (Scott, 2026-10-20). `clock`
   *  is the scene the clock would show; `held` when a pick is leading. */
  scenes?: { choices: KioskScreen[]; clock: KioskScreen; held: boolean; onPick: (screen: KioskScreen) => void }
  /** Local preview of another time of day (localhost ?at=6:58). */
  at?: Date
  /** The bar's NEXT: the day's next landmark (from the routines) or event. */
  next: { time: string; title: string } | null
}

export function KioskCanvas(p: KioskCanvasProps) {
  const { state, dispatch, nowMs, touched } = p.activity
  const stage = currentStage(state)
  const comp = useMemo(() => kioskComposition(p.moment, p.now), [p.moment, p.now])
  const hold = useMemo(() => ({ bedtimeInProgress: p.bedtime.inProgress }), [p.bedtime.inProgress])
  const { setHold } = p.activity
  const goBack = useCallback(() => dispatch({ type: 'BACK' }), [dispatch])
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
    weekendDates: datesLabel(weekendDates(p.now)),
  })
  const chips = heldChips(state, nowMs, hold)
  const next = nextCommitment(p.rows, p.now)
  const showHeld = showsHeldColumn(state)
  const [moreOpen, setMoreOpen] = useState(false)
  const [scenesOpen, setScenesOpen] = useState(false)
  const [stickyOpen, setStickyOpen] = useState(false)

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

  // One path for every sentence: speech, typing and the dock's chip.
  const tell = useTellSymphony(runCommand, p.voice, p.listenerPreview)

  // Say which timer finished, through the wall's speaker, just after the ring.
  const announced = useRef<Set<string>>(new Set())
  const { listener, live: listenerLive } = tell
  useEffect(() => {
    for (const t of state.timers) {
      if (!isTimerDone(t, nowMs)) { announced.current.delete(t.id); continue }
      if (announced.current.has(t.id)) continue
      announced.current.add(t.id)
      if (!finishedLive(t, nowMs) || !listenerLive) continue
      const text = doneAnnouncement(t)
      setTimeout(() => { void speechFor(text).then((wav) => (wav ? listener.play(wav) : listener.say(text))) }, 1200)
    }
  }, [state.timers, nowMs, listener, listenerLive])
  const [typing, setTyping] = useState(false)
  useWallFonts(!!p.v1)

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

  // More, in place (Kitchen wall v2): the Shell's tools by id, with the
  // canvas's own Recipes, Call and Listening — the places that used to sit
  // on the moments live here (and by voice). Typing is a tap on the mic.
  // Toggles keep it open so their new label shows; everything else closes it.
  const l = tell.listener
  const shellTile = (id: string): MoreTile | null => {
    const t = p.tools.more.find((m) => m.id === id)
    return t ? { ...t, onSelect: () => { if (id !== 'theme') setMoreOpen(false); t.onSelect() } } : null
  }
  const listenTile: MoreTile = tell.live
    ? {
        id: 'listen', label: l.muted ? 'Listening is off' : 'Listening is on',
        sub: l.muted ? `Tap to listen for “${l.wake ?? 'Hey Symphony'}” again` : l.quiet ? 'Quiet hours now · tap to mute' : 'Tap to mute',
        icon: l.muted ? MicOff : Mic, onSelect: () => l.mute(!l.muted),
      }
    : {
        id: 'listen', label: tell.voiceOn && tell.supported ? 'Voice is on' : 'Voice is off',
        sub: tell.supported ? (tell.voiceOn ? 'Listens when you tap the mic · tap to turn off' : 'Tap to let this screen listen when you tap the mic') : 'This screen can’t listen · type instead',
        icon: tell.voiceOn && tell.supported ? Mic : MicOff,
        onSelect: tell.supported ? tell.toggleVoice : () => { setMoreOpen(false); setTyping(true) },
      }
  const talk = tell.talk
  const endTalk = () => { talk.end(); tell.clearReply() }
  const math = p.math
  const openMath = useCallback((memberId?: string) => {
    if (memberId) math?.select(memberId)
    dispatch({ type: 'OPEN', stage: { kind: 'math' } })
  }, [math, dispatch])
  const mathLeft = math ? math.kids.filter((k) => k.daily?.status === 'open').length : 0
  // Only the wall Pi runs the home-energy bridge; elsewhere the tile stays hidden.
  const energy = p.energy ?? null
  const energyNow = energy && hasReading(energy.now) ? energy.now : null
  const moreTiles = [
    talk.enabled ? { id: 'plan', label: 'Help me plan the week', sub: planWeek(p.now, talk.weekStartsOn).label, icon: CalendarDays, onSelect: () => { setMoreOpen(false); void tell.handle('Help me plan the week', false) } } : null,
    math && math.kids.length > 0
      ? { id: 'math', label: 'Math of the day', sub: mathLeft ? `${mathLeft} still to solve` : 'All done today', icon: Calculator, onSelect: () => { setMoreOpen(false); openMath() } }
      : null,
    energyNow
      ? { id: 'energy', label: 'Energy', sub: `Solar ${formatWatts(energyNow.pv)} · using ${formatWatts(energyNow.house)}`, icon: Zap, onSelect: () => { setMoreOpen(false); dispatch({ type: 'OPEN', stage: { kind: 'energy' } }) } }
      : null,
    shellTile('list'),
    { id: 'recipes', label: 'Recipes', sub: 'The family’s recipes', icon: BookOpen, onSelect: () => { setMoreOpen(false); p.tools.onRecipes() } },
    shellTile('notes'),
    { id: 'call', label: 'Call', sub: 'Faces, big enough for the kids', icon: Phone, onSelect: () => { setMoreOpen(false); dispatch({ type: 'OPEN', stage: { kind: 'calling' } }) } },
    shellTile('theme'),
    listenTile,
    shellTile('guest'),
    shellTile('settings'),
  ].filter((t): t is MoreTile => !!t)
  const morePanel = <KioskMorePanel tiles={moreTiles} onDone={() => setMoreOpen(false)} />

  // ─── Talking with Symphony (stage 3) ───
  // A card, the week being planned or a day Symphony pointed at takes the
  // canvas (lead · conversation); otherwise the conversation takes the side
  // column of a two-column moment, and the reply band serves the rest.
  const week = p.week
  const talkOn = !!p.v1 && talk.enabled && talk.active && !!week
  const takeover = talkOn && (talk.planning || !!talk.card || talk.pointed.some((d) => week!.days.some((w) => localYmd(w.date) === d)))
  const bandMoment = stage.kind !== 'home' || !p.v1 || talkUsesBand(p.v1.pick.screen)
  const talkInSide = talkOn && !moreOpen && (takeover || !bandMoment)
  const convo = talkOn && week ? (
    <WallConversation talk={talk} info={week.task} today={p.now}
      onApprove={() => void tell.approveCard()} onUndo={() => void tell.undoCard()} onBack={takeover ? undefined : endTalk} />
  ) : null

  let content: ReactNode
  switch (stage.kind) {
    case 'home':
      content = p.v1 ? (
        <KioskHomeV1
          {...p.v1} now={p.v1.at ?? p.now} members={p.members} dinner={p.dinner} bedtime={p.bedtime}
          have={state.have} scale={p.dinner ? Math.max(1, Math.round((state.serves ?? p.dinner.baseServes) / p.dinner.baseServes)) : 1}
          onTick={p.onTick} onTapRow={p.onTapRow} onCompleteRow={p.onCompleteRow}
          onOpenKid={(m) => dispatch({ type: 'OPEN', stage: { kind: 'person', memberId: m.id } })}
          onToggleHave={(index) => dispatch({ type: 'TOGGLE_HAVE', index })}
          onScale={(n) => { if (p.dinner) dispatch({ type: 'SET_SERVES', serves: p.dinner.baseServes * n }) }}
          onAddMissing={() => { const said = addMissing(); if (said === 'Nothing missing' || said.startsWith('No')) p.flash(said) }}
          onOpenRecipe={p.onOpenRecipe}
          onStartCooking={() => { const said = startCooking(); if (said.startsWith('No')) p.flash(said) }}
          aside={moreOpen ? morePanel : undefined}
          talk={talkInSide && !bandMoment ? convo : undefined}
          math={math}
          onOpenMath={(m) => openMath(m.id)}
        />
      ) : (
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
    case 'math':
      content = math
        ? <MathStage math={math} now={p.now} flash={p.flash} />
        : <div className="kc-card kc-fill"><p className="kc-quiet-line">Math of the day isn’t ready.</p></div>
      break
    case 'webapp':
      content = <WebAppStage url={stage.url} title={stage.title} origin={stage.origin} routineId={stage.routineId} onClose={goBack} />
      break
    case 'energy':
      content = <EnergyStage live={energy} now={p.now} loadPeriod={p.loadEnergyPeriod} />
      break
    case 'agenda':
      content = p.agenda && p.onSetDone
        ? <AgendaStage view={stage.view} days={p.agenda} members={p.members} onSetDone={p.onSetDone} onTapRow={p.onTapRow} />
        : <div className="kc-card kc-fill"><p className="kc-quiet-line">Nothing to show.</p></div>
      break
  }

  if (takeover && week) {
    content = <WallTalkStage plan={talk.planning} side={convo} lead={<WallTalkLead talk={talk} week={week} today={p.now} onBack={endTalk} />} />
  }

  const W = p.weather
  const bottomTool = (label: string, sub: string | null, Icon: LucideIcon, onClick: () => void, aria?: string, active = false) => (
    <button type="button" className={`kc-tool ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={aria ?? label} aria-current={active ? 'page' : undefined}>
      <Icon aria-hidden="true" /><span>{label}</span>{sub && <small>{sub}</small>}
    </button>
  )
  const v1 = p.v1
  // v1: light by day, warm dark after dinner, on its own; the old manual
  // "Dark view" forced dark all day (Scott, 2026-10-13: "patchwork").
  const dark = v1 ? v1.pick.dark : p.isDark
  const title = v1 && stage.kind === 'home' ? v1.pick.title : place
  // v1 (mockup 2026-10-14): the place's scenery is a faint wash behind the
  // whole wall, band and bar included; fuller when nothing is pressing.
  const quietScreen = v1 && ['rest', 'night', 'weekend'].includes(v1.pick.screen)
  const wash = v1 && stage.kind === 'home' && scenery.showScenery
    ? sceneryArt(scenery.sceneryStyle, placeId, v1.pick.screen === 'night' ? 'nighttime' : dark ? 'dusk-dawn' : 'daytime').src
    : null
  // Settings live behind a long press on the clock, away from small fingers.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressClock = {
    onPointerDown: () => { pressTimer.current = setTimeout(() => setMoreOpen(true), 700) },
    onPointerUp: () => { if (pressTimer.current) clearTimeout(pressTimer.current) },
    onPointerLeave: () => { if (pressTimer.current) clearTimeout(pressTimer.current) },
  }
  const heldEls = chips.map((c) => {
    const body = <>{c.timer && <Timer aria-hidden="true" />}<span>{c.label}</span>{c.timer && <b>{c.timer}</b>}</>
    if (c.kind === 'timer') return <span key={c.kind} className={`kc-held-chip ${c.ringing ? 'is-ringing' : ''}`} role="status">{body}</span>
    const kind = c.kind
    const go = () => {
      if (kind === 'cooking') dispatch({ type: 'RESUME_COOKING' })
      else dispatch({ type: 'OPEN', stage: { kind } })
    }
    return <button key={c.kind} type="button" className={`kc-held-chip ${c.ringing ? 'is-ringing' : ''}`} onClick={go} aria-label={`${c.label}${c.timer ? ` · ${c.timer}` : ''}`}>{body}<ChevronRight aria-hidden="true" /></button>
  })

  // ─── Kitchen wall v2: top band · stage · the conversation dock ───
  if (v1) {
    const screen = stage.kind === 'home' ? v1.pick.screen : stage.kind === 'cooking' ? 'cooking' : 'activity'
    const copy = dockCopy(moreOpen ? 'more' : screen)
    // Home only away from Home: an activity, an answer, More, the week.
    const away = stage.kind !== 'home' || moreOpen || takeover || talk.active || !!tell.answer
    const ampm = /PM$/i.test(p.clock) ? 'pm' : /AM$/i.test(p.clock) ? 'am' : ''
    // Scenes are picked from Home only; an activity keeps its own title.
    const scenes = stage.kind === 'home' && !moreOpen ? v1.scenes ?? null : null
    return (
      <div className={`kiosk-canvas is-v1 ${dark ? 'is-dark dark' : ''} sky-${stage.kind === 'home' ? v1.pick.screen : 'activity'} ${moreOpen ? 'is-more' : ''}`} onPointerDownCapture={touched} data-stage={stage.kind}>
        {wash && <div className={`kv-wash ${quietScreen && !moreOpen ? '' : 'is-faint'}`} aria-hidden="true"><img src={wash} alt="" /></div>}
        <header className="kw-top">
          <span className="kw-clock" {...pressClock}>{p.clock.replace(/\s?[AP]M$/i, '')}<small>{ampm}</small></span>
          <span className="kw-date">{p.dateLabel}</span>
          {p.freshness}
          {stage.kind === 'agenda'
            ? <span className="kw-grow ka-band"><AgendaViews view={stage.view} onView={(view) => dispatch({ type: 'OPEN', stage: { kind: 'agenda', view } })} /></span>
            // Stickies ride the band on every Home moment but the quiet one,
            // which lays them out large in its lead.
            : stage.kind === 'home' && v1.pick.screen !== 'rest' && !moreOpen
              ? <span className="kw-grow kw-band-stickies"><StickyStrip notes={v1.notes} onOpen={v1.onNotes} /></span>
              : <span className="kw-grow" />}
          {W && <span className="kw-wx" title={W.condition}><W.icon aria-hidden="true" />{Math.round(W.temp)}° · {W.condition.toLowerCase()}</span>}
          <h1 className="kw-moment" ref={placeRef} tabIndex={-1} aria-live="polite">
            {scenes
              ? <button type="button" className="kw-scene-name" aria-expanded={scenesOpen} onClick={() => setScenesOpen((o) => !o)}>{title}{scenes.held && <small> · held</small>}</button>
              : title}
          </h1>
        </header>
        {scenes && scenesOpen && (
          <div className="kw-scenes" role="group" aria-label="Scenes">
            {scenes.choices.map((s) => (
              <button key={s} type="button" aria-pressed={s === v1.pick.screen} onClick={() => { scenes.onPick(s); setScenesOpen(false) }}>{sceneTitle(s, p.now)}</button>
            ))}
            {scenes.held && <button type="button" className="is-quiet" onClick={() => { scenes.onPick(scenes.clock); setScenesOpen(false) }}>Back to the clock</button>}
          </div>
        )}

        <div className={`kc-stage ${showHeld ? 'is-held' : ''}`}>
          {showHeld && <HeldColumn session={state.cooking} recipe={recipe} timers={state.timers} nowMs={nowMs} dispatch={dispatch} />}
          <main className={`kc-main is-${stage.kind} ${stage.kind === 'home' ? `v1-${v1.pick.screen}` : ''}`}>
            <div className="kc-main-inner">{content}</div>
          </main>
          {moreOpen && (stage.kind !== 'home' || takeover) && <div className="kw-more-over">{morePanel}</div>}
        </div>

        <KioskDock
          tell={tell} copy={copy} typing={typing} setTyping={setTyping}
          onHome={away ? () => { setMoreOpen(false); setTyping(false); endTalk(); dispatch({ type: 'HOME' }) } : undefined}
          onBack={state.stack.length >= 2 ? () => dispatch({ type: 'BACK' }) : undefined}
          moreOpen={moreOpen} onMore={() => setMoreOpen((o) => !o)}
          held={heldEls.length ? <div className="kw-held" aria-label="Held activities">{heldEls}</div> : null}
          next={v1.next}
          replyInSide={talkInSide}
          math={math && math.kids.length > 0 ? { onOpen: () => { setMoreOpen(false); openMath() }, open: mathLeft > 0, current: stage.kind === 'math' && !moreOpen } : undefined}
          onSticky={p.onAddSticky ? () => { setMoreOpen(false); setStickyOpen(true) } : undefined}
          agenda={p.agenda && p.onSetDone ? {
            onOpen: () => { setMoreOpen(false); dispatch({ type: 'OPEN', stage: { kind: 'agenda', view: p.now.getDay() === 0 || p.now.getDay() === 6 ? 'weekend' : 'today' } }) },
            current: stage.kind === 'agenda' && !moreOpen,
          } : undefined}
        />
        {stickyOpen && p.onAddSticky && <StickySheet members={p.members} onSave={p.onAddSticky} onClose={() => setStickyOpen(false)} />}
      </div>
    )
  }

  return (
    <div className={`kiosk-canvas ${dark ? 'is-dark dark' : ''}`} onPointerDownCapture={touched} data-stage={stage.kind}>
      <header className="kc-top">
        <div className="kc-time">
          <img className="kc-mark" src="/symphony-logo.png" alt="Symphony" />
          <div><b className="kc-clock">{p.clock}</b><span className="kc-date">{p.dateLabel}</span></div>
          {p.freshness}
        </div>
        <div className="kc-place-wrap">
          <small aria-hidden="true">YOU ARE IN</small>
          <h1 className="kc-place" ref={placeRef} tabIndex={-1} aria-live="polite">{title}</h1>
        </div>
        <div className="kc-top-right">
          {W && <span className="kc-weather" title={W.condition}><W.icon aria-hidden="true" />{Math.round(W.temp)}° · {W.condition.toLowerCase()}</span>}
          <span className="kc-context"><Home aria-hidden="true" />Household</span>
        </div>
      </header>

      <div className={`kc-stage ${showHeld ? 'is-held' : ''}`}>
        {showHeld && <HeldColumn session={state.cooking} recipe={recipe} timers={state.timers} nowMs={nowMs} dispatch={dispatch} />}
        <main className={`kc-main is-${stage.kind} ${stage.kind === 'home' ? `part-${comp.part}` : ''}`}>
          {scenery.showScenery && stage.kind === 'home' && comp.part === 'quiet' && (
            <div className="kc-scenery" aria-hidden="true"><img src={art.src} alt="" /></div>
          )}
          <div className="kc-main-inner">{content}</div>
        </main>
      </div>

      <nav className="kc-bar" aria-label="Kiosk">
        <button type="button" className="kc-nb" onClick={() => dispatch({ type: 'HOME' })} aria-current={stage.kind === 'home' ? 'page' : undefined}><Home aria-hidden="true" />Home</button>
        <button type="button" className="kc-nb" onClick={() => dispatch({ type: 'BACK' })} disabled={state.stack.length < 2}><ArrowLeft aria-hidden="true" />Back</button>
        <div className="kc-chips-held" aria-label="Held activities">{heldEls}</div>
        <div className="kc-tools" role="group" aria-label="Household tools">
          {bottomTool('Call', 'kidsPhone', Phone, () => dispatch({ type: 'OPEN', stage: { kind: 'calling' } }), 'Call — kidsPhone', stage.kind === 'calling')}
          {bottomTool('Groceries', null, ShoppingCart, p.tools.onGroceries)}
          {bottomTool('Recipes', null, ChefHat, p.tools.onRecipes)}
          {bottomTool('More', null, MoreHorizontal, () => setMoreOpen((o) => !o), 'More', moreOpen)}
        </div>
        <TellSymphonyPill tell={tell} />
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
