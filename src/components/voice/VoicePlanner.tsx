// src/components/voice/VoicePlanner.tsx
//
// "Plan out loud" (prototype): optional conversational and graphical
// guidance beside the ordinary planning pages, carrying the person's real
// plans forward. Three intents, kept apart from the horizon:
//  - Build my plan — a session starting at year, season, month, week or
//    today, moving breadth-first across all goals, with a checkpoint at the
//    end of each horizon.
//  - Add to my plan — one new thing, what it serves, an optional next step.
//  - Review my plan — the existing look-backs.
// "Continue your unfinished session" appears only when there is one.
// Existing goals and lines are shown and reused; only what is new is written,
// and only on Save. Every page stays directly editable.
//
// Voice is never on by default: it starts only from "Talk it through", and
// Mute and Stop are always beside it. The simulation transport says so on
// screen wherever it is in use.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleDashed, Mic, MicOff, Square } from 'lucide-react'
import {
  HORIZONS, LEVEL_NAME, activeGoals, goalColumns, goalTitle, hasContent, horizonOf, isCheck, newDraft, progress, reconcileDraft, reduce, resumeSummary, stalePeriods, stepsFor,
  type DraftPeriods, type ExistingPlan, type FlowAction, type Horizon, type PeriodLabels, type PlanDomain, type ReduceEnv, type VoicePlanDraft,
} from '@/lib/voiceOnboarding/flow'
import { planRows, saveRows, saveVoicePlan, type PlanRow, type SaveResult, type VoicePlanWriters } from '@/lib/voiceOnboarding/savePlan'
import { additionRows, newAddition, NEXT_LEVEL, parentChoices, type Addition } from '@/lib/voiceOnboarding/addition'
import { EXAMPLE_SAYS } from '@/lib/voiceOnboarding/existingPlan'
import { DemoTransport, type ConversationContext, type TransportStatus, type VoiceTransport } from '@/lib/voiceOnboarding/transport'
import { Checkpoint, ListStep, TodayStep, WeekStep, YearStep } from './PlanSteps'
import { GuidePanel } from './GuidePanel'
import type { AskGuide } from '@/lib/voiceOnboarding/guide'

const DOMAINS: { id: PlanDomain; label: string; note: string }[] = [
  { id: 'personal', label: 'Personal', note: 'Private to you' },
  { id: 'family', label: 'Family', note: 'Shared with your household' },
  { id: 'work', label: 'Work', note: 'Private to you' },
]
const PAGE_PATH: Record<Horizon, string> = { year: '/year', season: '/season', month: '/month', week: '/week', today: '/today' }

export type ReviewKind = 'month-review' | 'season-review' | 'week'
export type Phase = 'home' | 'build' | 'talk' | 'add' | 'review' | 'done'

export interface VoicePlannerProps {
  /** Names of the periods NOW (the home and the starts). A session names its
   *  own fixed periods (labelsFor(draft.periods)). */
  labels: PeriodLabels
  /** The periods a new session is fixed to: now. */
  periodsNow: DraftPeriods
  /** The names of a session's fixed periods. */
  labelsFor: (p: DraftPeriods) => PeriodLabels
  /** What the account already has — shown, kept and reused. */
  existing: ExistingPlan
  /** The unfinished session to offer, if any. */
  initialDraft: VoicePlanDraft | null
  /** Persist the draft (this device only). Returns false when storage failed. */
  persistDraft: (d: VoicePlanDraft | null) => boolean
  writers: VoicePlanWriters
  /** Voice, when there is a real one (or the labelled simulation in the
   *  preview). Absent: no voice controls at all — typing is the way. */
  makeTransport?: () => VoiceTransport
  /** Shown above the page when saving is simulated (the ungated preview). */
  simulatedSave?: boolean
  onOpen?: (path: string) => void
  /** Hand off to an existing look-back. */
  onReview?: (kind: ReviewKind) => void
  /** The typed guide (planning-conversation), when it is switched on. */
  askGuide?: AskGuide
  /** Where to open (the preview's scenes). */
  start?: { phase: Phase; draft?: VoicePlanDraft; addition?: Addition }
  newId?: () => string
}

type Act = FlowAction | { type: 'reset'; draft: VoicePlanDraft | null }

export function VoicePlanner(props: VoicePlannerProps) {
  const { labels: labelsNow, periodsNow, labelsFor, existing, initialDraft, persistDraft, writers, makeTransport, simulatedSave, onOpen, onReview, start } = props
  const labels = labelsNow
  const env = useMemo<ReduceEnv>(() => ({ existing, newId: props.newId ?? (() => crypto.randomUUID()) }), [existing, props.newId])
  const [draft, dispatchRaw] = useReducer(
    (d: VoicePlanDraft | null, a: Act) => (a.type === 'reset' ? a.draft : d ? reduce(d, a, env) : d),
    start?.draft ?? null,
  )
  const [phase, setPhase] = useState<Phase>(start?.phase ?? 'home')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  // An unfinished session, checked against what the person may see NOW
  // (goals they can't see leave it; a chosen line that is gone is unchosen).
  const [resumable, setResumable] = useState<VoicePlanDraft | null>(initialDraft && hasContent(initialDraft) ? reconcileDraft(initialDraft, existing) : null)
  const [finished, setFinished] = useState<PlanRow[]>([])
  // While a save is in flight nothing on the session changes: an edit or a
  // move then would not be what was written, or would lose the ledger.
  const savingRef = useRef(false)
  const dispatch = useCallback((a: FlowAction) => { if (!savingRef.current) dispatchRaw(a) }, [])
  /** The guide's Add: taken only when it changes the draft. */
  const applyGuide = useCallback((a: FlowAction) => {
    if (savingRef.current || !draft) return false
    if (reduce(draft, a, env) === draft) return false
    dispatchRaw(a)
    return true
  }, [draft, env])

  // ── Voice ────────────────────────────────────────────────────────────────
  const transportRef = useRef<VoiceTransport | null>(null)
  const [voice, setVoice] = useState<TransportStatus>('idle')
  const [voiceKind, setVoiceKind] = useState<'demo' | 'realtime' | null>(null)
  const [demo, setDemo] = useState<DemoTransport | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [guideLine, setGuideLine] = useState<string>('')
  // What was heard, and whether the guide was talked over, belong to the
  // question they happened on; a new question starts clean.
  const [heard, setHeard] = useState<{ text: string; at: string }>({ text: '', at: '' })
  const [speaking, setSpeaking] = useState<{ user: boolean; assistant: boolean }>({ user: false, assistant: false })
  const [interruptedOn, setInterruptedOn] = useState<string | null>(null)
  const atKey = draft ? `${draft.step}|${draft.focus}` : ''
  const atRef = useRef('')
  useEffect(() => { atRef.current = atKey }, [atKey])
  const voiceOn = voice === 'live' || voice === 'muted' || voice === 'connecting'

  const context = useCallback((d: VoicePlanDraft): ConversationContext => {
    const cols = goalColumns(d, existing)
    const h = horizonOf(d.step)
    return {
      step: d.step,
      ...(h === 'season' || h === 'month' ? { focus: goalTitle(d, d.focus) } : {}),
      plan: cols.map((c) => `${c.title}: ${[c.season.map((s) => s.text).join('; '), c.month.map((m) => m.text).join('; '), c.week.map((w) => w.text).join('; ')].filter(Boolean).join(' / ') || '—'}`),
    }
  }, [existing])

  const startVoice = useCallback(async () => {
    if (!draft || !makeTransport) return
    transportRef.current?.stop()
    const t = makeTransport()
    transportRef.current = t
    setVoiceKind(t.kind)
    setDemo(t instanceof DemoTransport ? t : null)
    setVoiceError(null)
    setInterruptedOn(null)
    t.subscribe((e) => {
      if (transportRef.current !== t) return
      switch (e.type) {
        case 'status': setVoice(e.status); if (e.reason === 'time_limit') setVoiceError('The voice session reached its time limit. Your plan so far is kept.'); break
        case 'assistant': setGuideLine(e.text); break
        case 'user': setHeard({ text: e.text, at: atRef.current }); break
        case 'speaking':
          setSpeaking((s) => {
            if (e.who === 'user' && e.active && s.assistant) setInterruptedOn(atRef.current)
            return { ...s, [e.who]: e.active }
          })
          break
        case 'propose': dispatch({ type: 'answer', level: e.level, text: e.text, goal: e.goal }); break
        case 'error': setVoiceError(e.message); break
      }
    })
    await t.start(context(draft))
  }, [draft, makeTransport, context, dispatch])

  const stopVoice = useCallback(() => {
    transportRef.current?.stop()
    setSpeaking({ user: false, assistant: false })
  }, [])

  // Leaving the page always releases the microphone.
  useEffect(() => () => { transportRef.current?.stop(); transportRef.current = null }, [])

  // Keep the voice in step with touch and typing.
  const lastSync = useRef<string | null>(null)
  useEffect(() => {
    if (!draft || !transportRef.current || !voiceOn) return
    const ctx = context(draft)
    const key = `${ctx.step}|${ctx.focus}|${ctx.plan.join('|')}`
    if (key === lastSync.current) return
    lastSync.current = key
    transportRef.current.sync(ctx)
  }, [draft, voiceOn, context])

  // ── Draft on this device ─────────────────────────────────────────────────
  useEffect(() => {
    if (draft && phase === 'talk') persistDraft(draft)
  }, [draft, phase, persistDraft])

  const begin = (h: Horizon) => {
    dispatchRaw({ type: 'reset', draft: newDraft(h, existing, periodsNow) })
    setResult(null)
    setPhase('talk')
  }
  const resumeDraft = () => {
    if (!initialDraft) return
    dispatchRaw({ type: 'reset', draft: reconcileDraft(initialDraft, existing) })
    setPhase('talk')
  }
  const saveDraftAndLeave = () => {
    if (!draft || savingRef.current) return
    stopVoice()
    const kept = persistDraft(draft)
    setDraftNote(kept ? 'Session kept on this device. Continue it from here any time.' : 'This browser couldn’t keep the session.')
    if (kept && hasContent(draft)) setResumable(draft)
    setPhase('home')
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!draft || savingRef.current) return
    stopVoice()
    savingRef.current = true
    setSaving(true)
    // What is saved is checked against what the person may see now.
    let d = reconcileDraft(draft, existing)
    const rows = planRows(d, existing)
    const r = await saveVoicePlan(d, existing, writers, (id) => {
      d = reduce(d, { type: 'markSaved', ids: [id] }, env)
      persistDraft(d) // progress survives a reload mid-save
    })
    dispatchRaw({ type: 'reset', draft: d })
    setResult(r)
    savingRef.current = false
    setSaving(false)
    if (r.ok) {
      persistDraft(null)
      setResumable(null)
      setFinished(rows)
      setPhase('done')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="vo-page">
      {simulatedSave && (
        <p className="vo-banner" role="note">Design preview. The plan below is an example, voice is simulated, and Save writes nothing.</p>
      )}

      {phase === 'home' && (
        <Home labels={labels} existing={existing} resumable={resumable} note={draftNote}
          stale={resumable ? stalePeriods(resumable, periodsNow) : []} sessionLabels={resumable ? labelsFor(resumable.periods) : null}
          onResume={() => { if (resumable) { dispatchRaw({ type: 'reset', draft: reconcileDraft(resumable, existing) }); setPhase('talk') } else resumeDraft() }}
          voice={!!makeTransport}
          onBuild={() => setPhase('build')} onAdd={() => setPhase('add')} onReview={() => setPhase('review')} onOpen={onOpen} />
      )}

      {phase === 'build' && <BuildStart labels={labels} existing={existing} onBegin={begin} onBack={() => setPhase('home')} />}

      {phase === 'add' && (
        <AddToPlan labels={labels} periods={periodsNow} existing={existing} writers={writers} simulated={!!simulatedSave} initial={start?.addition}
          newId={props.newId} onBack={() => setPhase('home')} onOpen={onOpen} />
      )}

      {phase === 'review' && <ReviewHub labels={labels} existing={existing} simulated={!!simulatedSave} onReview={onReview} onBack={() => setPhase('home')} />}

      {phase === 'talk' && draft && (() => { const labels = labelsFor(draft.periods); const stale = stalePeriods(draft, periodsNow); return (
        <fieldset className="vo-session" disabled={saving} aria-busy={saving}>
          <legend className="sr-only">Planning session</legend>
          {stale.length > 0 && <p className="vo-note vo-stale" role="note">This session plans {labels.month} and the week of {labels.week}, as it did when you began{stale.includes('today') ? ` — and “today” here is ${labels.today}` : ''}. Save writes there.</p>}
          <ProgressRail draft={draft} existing={existing} labels={labels} dispatch={dispatch} />
          <div className="vo-talk">
            <section className="vo-conversation" aria-label="Conversation">
              {draft.step === 'review'
                ? <SessionReview draft={draft} existing={existing} labels={labels} dispatch={dispatch} onSave={save} saving={saving} result={result} />
                : <StepScreen key={`${draft.step}`} draft={draft} existing={existing} labels={labels} dispatch={dispatch} />}

              {props.askGuide && draft.step !== 'review' && (
                <GuidePanel draft={draft} existing={existing} labels={labels} ask={props.askGuide} apply={applyGuide} />
              )}

              {makeTransport && <VoiceBar
                status={voice} kind={voiceKind} error={voiceError} guideLine={guideLine}
                heard={heard.at === atKey ? heard.text : ''}
                speaking={speaking} interrupted={interruptedOn === atKey}
                onStart={startVoice} onStop={stopVoice}
                onMute={(m) => transportRef.current?.setMuted(m)}
                demo={demo} draft={draft}
              />}

              <div className="vo-footer">
                <button type="button" className="vo-quiet" onClick={saveDraftAndLeave}>Stop here and continue later</button>
                {draft.step !== 'review' && hasContent(draft) && <button type="button" className="vo-quiet" onClick={() => dispatch({ type: 'review' })}>Review what’s new</button>}
              </div>
            </section>

            <PlanPanel draft={draft} existing={existing} labels={labels} dispatch={dispatch} />
          </div>
        </fieldset>
      ) })()}

      {phase === 'done' && (
        <Finished rows={finished} labels={draft ? labelsFor(draft.periods) : labels} onOpen={onOpen} simulated={!!simulatedSave}
          onAgain={() => { setPhase('home'); dispatchRaw({ type: 'reset', draft: null }) }} />
      )}
    </div>
  )
}

function StepScreen(p: { draft: VoicePlanDraft; existing: ExistingPlan; labels: PeriodLabels; dispatch: (a: FlowAction) => void }) {
  const s = p.draft.step
  if (isCheck(s)) return <Checkpoint {...p} />
  if (s === 'year') return <YearStep {...p} />
  if (s === 'season' || s === 'month') return <ListStep {...p} h={s} />
  if (s === 'week') return <WeekStep {...p} />
  return <TodayStep {...p} />
}

// ── Home: the intent, then the horizon ─────────────────────────────────────

function Home({ labels, existing, resumable, note, onResume, onBuild, onAdd, onReview, onOpen, stale, sessionLabels, voice }: {
  labels: PeriodLabels; existing: ExistingPlan; resumable: VoicePlanDraft | null; note: string | null
  onResume: () => void; onBuild: () => void; onAdd: () => void; onReview: () => void; onOpen?: (p: string) => void
  /** Which of the unfinished session's fixed periods are no longer now. */
  stale: string[]; sessionLabels: PeriodLabels | null
  /** Voice is on offer (a real connection, or the preview's simulation). */
  voice: boolean
}) {
  const goals = existing.goals.length
  const open = (existing.lookBack?.month ?? 0) + (existing.lookBack?.season ?? 0)
  return (
    <div className="vo-choose">
      <p className="vo-eyebrow">{voice ? 'Plan out loud' : 'Guided planning'}</p>
      <h1 className="vo-title">What would you like to do?</h1>
      <p className="vo-lede">{voice ? 'Talk, type, or tap.' : 'Type or tap.'} You can stop at any point and pick up later — and every page stays yours to edit directly.</p>
      {note && <p className="vo-note" role="status">{note}</p>}
      {resumable && (
        <button type="button" className="vo-resume" onClick={onResume}>
          <span className="vo-resume-title">Continue your unfinished session</span>
          <span className="vo-resume-body">{resumeSummary(resumable, sessionLabels ?? labels)}</span>
          {stale.length > 0 && sessionLabels && <span className="vo-resume-stale">Planned for {sessionLabels.month}, week of {sessionLabels.week}{stale.includes('today') ? `, today ${sessionLabels.today}` : ''} — it still writes there.</span>}
        </button>
      )}
      <ul className="vo-intents">
        <li>
          <button type="button" className="vo-intent" onClick={onBuild}>
            <span className="vo-intent-title">Build my plan</span>
            <span className="vo-intent-body">Go horizon by horizon — year, season, month, week, today — with all your goals together.</span>
            <span className="vo-intent-meta">{goals ? `Starts from the ${goals} ${goals === 1 ? 'goal' : 'goals'} already on your plan` : 'Start from any horizon'}</span>
            <ArrowRight className="vo-intent-arrow" size={20} aria-hidden />
          </button>
        </li>
        <li>
          <button type="button" className="vo-intent" onClick={onAdd}>
            <span className="vo-intent-title">Add to my plan</span>
            <span className="vo-intent-body">Put one new thing in the right place, linked to what it serves — and plan its next step if you like.</span>
            <span className="vo-intent-meta">A goal, a {labels.season} or {labels.month} line, a task this week, something for today</span>
            <ArrowRight className="vo-intent-arrow" size={20} aria-hidden />
          </button>
        </li>
        <li>
          <button type="button" className="vo-intent" onClick={onReview}>
            <span className="vo-intent-title">Review my plan</span>
            <span className="vo-intent-body">Look back at what’s still open and decide, one by one, what carries forward.</span>
            <span className="vo-intent-meta">{open ? `${open} ${open === 1 ? 'line' : 'lines'} still open from before` : 'Uses the look-backs on the Month and Season pages'}</span>
            <ArrowRight className="vo-intent-arrow" size={20} aria-hidden />
          </button>
        </li>
      </ul>
      <p className="vo-fine">
        Or edit directly:{' '}
        {HORIZONS.map((h, i) => (
          <span key={h}>{i > 0 && ' · '}<button type="button" className="vo-link vo-inline-link" onClick={() => onOpen?.(PAGE_PATH[h])} disabled={!onOpen}>{h === 'week' ? 'Week' : h === 'today' ? 'Today' : labels[h]}</button></span>
        ))}
      </p>
    </div>
  )
}

const START_COPY: Record<Horizon, string> = {
  year: 'Choose your goals, then give each a turn at every horizon below.',
  season: 'A milestone for each goal this season, then the month, week and today.',
  month: 'This month’s priorities across your goals, then the week and today.',
  week: 'One list for the week, across your goals, then today.',
  today: 'Choose what to do today from this week.',
}

function BuildStart({ labels, existing, onBegin, onBack }: { labels: PeriodLabels; existing: ExistingPlan; onBegin: (h: Horizon) => void; onBack: () => void }) {
  const count = (h: Horizon) => {
    if (h === 'year') return existing.goals.length ? `${existing.goals.length} ${existing.goals.length === 1 ? 'goal' : 'goals'} on your plan` : 'Nothing yet'
    if (h === 'today') { const n = existing.items.filter((i) => i.today).length; return n ? `${n} chosen` : 'Nothing chosen' }
    const n = existing.items.filter((i) => i.horizon === h).length
    return n ? `${n} already on it` : 'Nothing yet'
  }
  return (
    <div className="vo-choose">
      <button type="button" className="vo-quiet vo-back-top" onClick={onBack}><ArrowLeft size={14} aria-hidden /> All choices</button>
      <p className="vo-eyebrow">Build my plan</p>
      <h1 className="vo-title">Where should we start?</h1>
      <p className="vo-lede">Each horizon is done for every goal before the next one. What’s already on your plan stays, and you only add what’s missing.</p>
      <ol className="vo-horizons">
        {HORIZONS.map((h) => (
          <li key={h}>
            <button type="button" className="vo-horizon" onClick={() => onBegin(h)} aria-describedby={`vo-h-${h}`}>
              <span className="vo-horizon-level">{LEVEL_NAME[h]}</span>
              <span className="vo-horizon-period">{h === 'week' ? labels.week : h === 'today' ? labels.today : labels[h]}</span>
              <span className="vo-horizon-copy" id={`vo-h-${h}`}>{START_COPY[h]}</span>
              <span className="vo-horizon-path" aria-hidden>{stepsFor(h).map((s) => LEVEL_NAME[s]).join(' → ')}</span>
              <span className="vo-horizon-have">{count(h)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="vo-fine">Optional. Nothing is saved until you review the session and press Save.</p>
    </div>
  )
}

// ── Progress: the horizons, each with how far it got ───────────────────────

function ProgressRail({ draft, existing, labels, dispatch }: { draft: VoicePlanDraft; existing: ExistingPlan; labels: PeriodLabels; dispatch: (a: FlowAction) => void }) {
  const rail = progress(draft, existing)
  const atReview = draft.step === 'review'
  // On a phone the rail scrolls sideways: keep the current step in view.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = navRef.current
    const cur = nav?.querySelector<HTMLElement>('[aria-current="step"]')
    if (nav && cur) nav.scrollLeft = Math.max(0, cur.offsetLeft - (nav.clientWidth - cur.clientWidth) / 2)
  }, [draft.step])
  return (
    <nav className="vo-rail" aria-label="Progress" ref={navRef}>
      <ol>
        {rail.map((p) => (
          <li key={p.h} className={`is-${p.state}`} aria-current={p.state === 'current' ? 'step' : undefined}>
            <button type="button" onClick={() => dispatch({ type: 'edit', level: p.h })} disabled={p.state === 'current' && !isCheck(draft.step)}>
              <span className="vo-rail-mark" aria-hidden>{p.state === 'done' ? <Check size={12} /> : p.state === 'skipped' ? '–' : p.state === 'before' ? '' : <CircleDashed size={12} />}</span>
              <span className="vo-rail-name">{p.h === 'week' ? 'Week' : p.h === 'today' ? 'Today' : labels[p.h]}</span>
              <span className="vo-rail-detail">{p.state === 'before' ? 'Not in this session' : p.state === 'skipped' ? 'Skipped' : p.detail}</span>
            </button>
          </li>
        ))}
        <li className={atReview ? 'is-current' : 'is-upcoming'} aria-current={atReview ? 'step' : undefined}>
          <button type="button" onClick={() => dispatch({ type: 'review' })} disabled={atReview}>
            <span className="vo-rail-mark" aria-hidden>{atReview ? <CircleDashed size={12} /> : ''}</span>
            <span className="vo-rail-name">Review</span>
            <span className="vo-rail-detail">Then save</span>
          </button>
        </li>
      </ol>
    </nav>
  )
}

// ── The plan, by goal: every commitment in view ────────────────────────────

function PlanPanel({ draft, existing, labels, dispatch }: { draft: VoicePlanDraft; existing: ExistingPlan; labels: PeriodLabels; dispatch: (a: FlowAction) => void }) {
  const cols = goalColumns(draft, existing)
  const here = horizonOf(draft.step)
  const show = (['season', 'month', 'week'] as const).filter((h) => stepsFor(draft.startAt).includes(h) || cols.some((c) => c[h].length))
  return (
    <aside className="vo-plan" aria-label="Your plan">
      <p className="vo-eyebrow">Your plan, by goal</p>
      {cols.length === 0 && <p className="vo-card-empty">Your goals will appear here.</p>}
      <ul className="vo-goal-cards">
        {cols.map((c) => (
          <li key={c.key} className={`vo-goal-card${(here === 'season' || here === 'month') && draft.focus === c.key ? ' is-active' : ''}`}>
            <div className="vo-goal-card-head">
              <span className="vo-goal-card-title">{c.title}</span>
              {c.key !== 'free' && <span className={`vo-tag${c.existing ? '' : ' is-new'}`}>{c.existing ? 'On your plan' : 'New'}</span>}
            </div>
            <dl className="vo-goal-card-lines">
              {show.map((h) => {
                const items = c[h]
                const deferred = h !== 'week' && c.deferred.includes(h)
                return (
                  <div key={h} className={here === h ? 'is-here' : ''}>
                    <dt>{h === 'week' ? 'Week' : labels[h]}</dt>
                    <dd>
                      {items.length === 0
                        ? <span className="vo-card-empty">{deferred ? `Not this ${h}` : '—'}</span>
                        : <ul>{items.map((it, i) => (
                            <li key={i} className={`${it.existing ? 'is-existing' : 'is-new'}${'today' in it && it.today ? ' is-today' : ''}`}>{it.text}</li>
                          ))}</ul>}
                      {h !== 'week' && c.key !== 'free' && (
                        <button type="button" className="vo-card-edit" onClick={() => dispatch({ type: 'edit', level: h, goal: c.key })} aria-label={`Change ${labels[h]} for ${c.title}`}>Change</button>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </li>
        ))}
      </ul>
      <p className="vo-fine"><span className="vo-key is-existing" /> already on your plan · <span className="vo-key is-new" /> new in this session</p>
    </aside>
  )
}

// ── Voice controls ─────────────────────────────────────────────────────────

function VoiceBar({ status, kind, error, guideLine, heard, speaking, interrupted, onStart, onStop, onMute, demo, draft }: {
  status: TransportStatus; kind: 'demo' | 'realtime' | null; error: string | null; guideLine: string; heard: string
  speaking: { user: boolean; assistant: boolean }; interrupted: boolean
  onStart: () => void; onStop: () => void; onMute: (m: boolean) => void; demo: DemoTransport | null; draft: VoicePlanDraft
}) {
  const on = status === 'live' || status === 'muted'
  const state = status === 'connecting' ? 'Connecting…'
    : status === 'muted' ? 'Muted — the guide can’t hear you'
    : speaking.user ? 'Listening to you'
    : speaking.assistant ? 'The guide is speaking — talk any time to interrupt'
    : on ? 'Listening' : ''
  const example = exampleFor(draft)
  return (
    <div className={`vo-voice${on ? ' is-on' : ''}`} aria-label="Voice">
      {kind === 'demo' && (on || status === 'ended' || status === 'error') && (
        <p className="vo-sim" role="note">Simulation — no microphone, nothing sent anywhere.</p>
      )}
      <div className="vo-voice-row">
        <span className={`vo-orb${on ? ' is-on' : ''}${speaking.user ? ' is-user' : ''}${speaking.assistant ? ' is-guide' : ''}${status === 'muted' ? ' is-muted' : ''}`} aria-hidden />
        {!on && status !== 'connecting' && (
          <button type="button" className="vo-voice-start" onClick={onStart}><Mic size={16} aria-hidden /> Talk it through</button>
        )}
        {(on || status === 'connecting') && (
          <>
            <span className="vo-voice-state" role="status" aria-live="polite">{state}</span>
            <button type="button" className="vo-icon" onClick={() => onMute(status !== 'muted')} disabled={!on}
              aria-pressed={status === 'muted'} aria-label={status === 'muted' ? 'Unmute' : 'Mute'}>
              {status === 'muted' ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
            </button>
            <button type="button" className="vo-icon" onClick={onStop} aria-label="Stop voice"><Square size={14} aria-hidden /></button>
          </>
        )}
      </div>
      {on && guideLine && <p className="vo-guide-line"><span className="vo-who">Guide</span>{guideLine}</p>}
      {on && heard && <p className="vo-heard"><span className="vo-who">You</span>{heard}</p>}
      {on && interrupted && <p className="vo-fine">You spoke over the guide, so it stopped to listen.</p>}
      {status === 'ended' && !error && <p className="vo-fine">Voice is off. Keep going by typing or tapping.</p>}
      {error && <p className="vo-error" role="alert">{error}</p>}
      {demo && on && draft.step !== 'review' && (
        <div className="vo-sim-controls" aria-label="Simulation controls">
          {example && <button type="button" className="vo-link" onClick={() => example.forEach((t) => demo.say(t))}>Simulate saying the example</button>}
          <button type="button" className="vo-link" onClick={() => demo.interrupt()}>Simulate talking over the guide</button>
          <button type="button" className="vo-link" onClick={() => demo.fail()}>Simulate a dropped connection</button>
        </div>
      )}
    </div>
  )
}

/** The example's words for the question on screen (the simulation only). */
function exampleFor(d: VoicePlanDraft): string[] | null {
  if (isCheck(d.step) || d.step === 'review') return null
  const h = d.step as Horizon
  if (h === 'year') return EXAMPLE_SAYS.year.filter((t) => !d.goals.some((g) => g.title === t))
  if (h === 'week') return EXAMPLE_SAYS.week
  if (h === 'today') return [EXAMPLE_SAYS.today]
  const said = EXAMPLE_SAYS[h][goalTitle(d, d.focus)]
  return said ? [said] : null
}

// ── Review and save a session ──────────────────────────────────────────────

function whereItGoes(r: PlanRow, labels: PeriodLabels): string {
  if (r.level === 'year') return `${labels.year} goal`
  if (r.level === 'season') return `${labels.season} list`
  if (r.level === 'month') return `${labels.month} list`
  if (r.level === 'today') return `${labels.today} — chosen for the day`
  return 'This week'
}

function SessionReview({ draft, existing, labels, dispatch, onSave, saving, result }: {
  draft: VoicePlanDraft; existing: ExistingPlan; labels: PeriodLabels; dispatch: (a: FlowAction) => void; onSave: () => void; saving: boolean; result: SaveResult | null
}) {
  const rows = planRows(draft, existing)
  const done = new Set(result?.saved ?? draft.saved)
  const keptGoals = activeGoals(draft).filter((g) => g.existing).length
  const keptLines = existing.items.length
  const servesTitle = (id?: string) => (id ? goalTitle(draft, id) : null)
  const needsDomain = rows.some((r) => r.level === 'year' || !r.goalId || !activeGoals(draft).find((g) => g.id === r.goalId)?.context)
  return (
    <div className="vo-ask">
      <p className="vo-eyebrow">Review</p>
      <h2 className="vo-question">Does this read right?</h2>
      <p className="vo-hint">This is everything new that Save will add. Change anything from the plan or the progress bar above.</p>
      <ul className="vo-review" aria-label="What will be saved">
        {rows.map((r) => (
          <li key={r.id} className={done.has(r.id) ? 'is-saved' : ''}>
            <span className="vo-review-where">{whereItGoes(r, labels)}</span>
            <span className="vo-review-title">{r.title}{servesTitle(r.goalId) && <span className="vo-review-serves">serves {servesTitle(r.goalId)}</span>}</span>
            {done.has(r.id) && <Check size={14} aria-label="Saved" />}
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="vo-fine">Nothing new yet — everything on screen is already on your plan.</p>}
      {(keptGoals > 0 || keptLines > 0) && (
        <p className="vo-fine">Kept as they are, not copied: {keptGoals} {keptGoals === 1 ? 'goal' : 'goals'} and {keptLines} {keptLines === 1 ? 'line' : 'lines'} already on your plan.</p>
      )}
      {needsDomain && (
        <fieldset className="vo-domains">
          <legend className="vo-hint">Where do the new goals and unlinked lines belong? Lines under an existing goal stay with that goal.</legend>
          {DOMAINS.map((o) => (
            <label key={o.id} className={`vo-domain${draft.domain === o.id ? ' is-selected' : ''}`}>
              <input type="radio" name="vo-domain" checked={draft.domain === o.id} onChange={() => dispatch({ type: 'setDomain', domain: o.id })} disabled={saving || draft.saved.length > 0} />
              <span>{o.label}</span><span className="vo-domain-note">{o.note}</span>
            </label>
          ))}
        </fieldset>
      )}
      {result && !result.ok && <SaveFailure result={result} total={rows.length} />}
      <div className="vo-answer">
        <button type="button" className="vo-primary" onClick={onSave} disabled={saving || rows.length === 0}>
          {saving ? 'Saving…' : result && !result.ok ? 'Try again' : 'Save to Symphony'}
        </button>
        <button type="button" className="vo-quiet" onClick={() => dispatch({ type: 'back' })} disabled={saving || draft.trail.length === 0}>
          <ArrowLeft size={14} aria-hidden /> Back
        </button>
      </div>
    </div>
  )
}

function SaveFailure({ result, total }: { result: SaveResult; total: number }) {
  return (
    <div className="vo-error" role="alert">
      <p>{result.saved.length > 0 ? `${result.saved.length} of ${total} saved.` : 'Nothing was saved.'} These didn’t save:</p>
      <ul>{result.failed.map((f) => <li key={f.id}>{f.title}{f.reason === 'parent_not_saved' ? ' (waits for the line it belongs to)' : ''}</li>)}</ul>
      <p>Try again — anything already saved won’t be added twice.</p>
    </div>
  )
}

// ── Add to my plan ─────────────────────────────────────────────────────────

function AddToPlan({ labels, periods, existing, writers, simulated, initial, newId, onBack, onOpen }: {
  labels: PeriodLabels; periods: DraftPeriods; existing: ExistingPlan; writers: VoicePlanWriters; simulated: boolean; initial?: Addition
  newId?: () => string; onBack: () => void; onOpen?: (p: string) => void
}) {
  const [a, setA] = useState<Addition | null>(initial ?? null)
  const [saved, setSaved] = useState<string[]>([])
  const [result, setResult] = useState<SaveResult | null>(null)
  const [saving, setSaving] = useState(false)
  const rows = a ? additionRows(a, existing) : []
  const what = (h: Horizon) => (h === 'year' ? `A goal for ${labels.year}` : h === 'week' ? 'A task this week' : h === 'today' ? 'Something for today' : `A ${labels[h]} line`)
  const save = async () => {
    if (!a || saving) return
    setSaving(true)
    const r = await saveRows(rows, writers, saved, periods, (id) => setSaved((s) => [...s, id]))
    setResult(r)
    setSaved(r.saved)
    setSaving(false)
  }
  if (result?.ok && a) {
    return (
      <div className="vo-choose vo-done">
        <p className="vo-eyebrow">Add to my plan</p>
        <h1 className="vo-title">{simulated ? 'That’s how adding ends' : 'Added'}</h1>
        <ul className="vo-review">{rows.map((r) => <li key={r.id}><span className="vo-review-where">{whereItGoes(r, labels)}</span><span className="vo-review-title">{r.title}</span></li>)}</ul>
        {simulated && <p className="vo-note">Preview only — nothing was written.</p>}
        <div className="vo-done-links">
          <button type="button" className="vo-link" onClick={() => { setA(null); setResult(null); setSaved([]) }}>Add something else</button>
          <button type="button" className="vo-quiet" onClick={onBack}>All choices</button>
        </div>
      </div>
    )
  }
  const parents = a ? parentChoices(a.horizon, existing) : []
  const lower = a ? NEXT_LEVEL[a.horizon] : undefined
  const parentKind = (k: 'goal' | 'season' | 'month') => (k === 'goal' ? `${labels.year} goal` : `${labels[k]} line`)
  return (
    <div className="vo-choose vo-add">
      <button type="button" className="vo-quiet vo-back-top" onClick={onBack} disabled={saving}><ArrowLeft size={14} aria-hidden /> All choices</button>
      <p className="vo-eyebrow">Add to my plan</p>
      <h1 className="vo-title">What are you adding?</h1>
      <fieldset disabled={saving || saved.length > 0} className="vo-add-fields">
      <legend className="sr-only">New addition</legend>
      <div className="vo-add-kinds" role="radiogroup" aria-label="What are you adding?">
        {HORIZONS.map((h) => (
          <button key={h} type="button" role="radio" aria-checked={a?.horizon === h} className={`vo-add-kind${a?.horizon === h ? ' is-selected' : ''}`}
            onClick={() => setA((prev) => ({ ...(prev ?? newAddition(h, null, newId)), horizon: h, parent: prev && parentChoices(h, existing).some((p) => p.id === prev.parent) ? prev.parent : null, next: '', nextToday: false }))}>
            {what(h)}
          </button>
        ))}
      </div>
      {a && (
        <>
          <label className="vo-field">
            <span className="vo-field-label">{what(a.horizon)}</span>
            <input className="vo-input" value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} maxLength={140}
              placeholder={a.horizon === 'year' ? 'Learn to make bread' : a.horizon === 'week' ? 'Call the hardware shop' : 'Write it in a line'} />
          </label>
          {parents.length > 0 && (
            <fieldset className="vo-field">
              <legend className="vo-field-label">What does it serve?</legend>
              <div className="vo-parents">
                {parents.map((p) => (
                  <label key={p.id} className={`vo-parent${a.parent === p.id ? ' is-selected' : ''}`}>
                    <input type="radio" name="vo-parent" checked={a.parent === p.id} onChange={() => setA({ ...a, parent: p.id })} />
                    <span className="vo-parent-title">{p.title}</span><span className="vo-parent-kind">{parentKind(p.kind)}</span>
                  </label>
                ))}
                <label className={`vo-parent${a.parent === null ? ' is-selected' : ''}`}>
                  <input type="radio" name="vo-parent" checked={a.parent === null} onChange={() => setA({ ...a, parent: null })} />
                  <span className="vo-parent-title">Nothing — it stands on its own</span>
                </label>
              </div>
            </fieldset>
          )}
          {lower && (
            <label className="vo-field">
              <span className="vo-field-label">Its next step {lower === 'week' ? 'this week' : `in ${labels[lower]}`} <span className="vo-optional">optional</span></span>
              <input className="vo-input" value={a.next} onChange={(e) => setA({ ...a, next: e.target.value })} maxLength={140} placeholder="Leave empty to stop here" />
            </label>
          )}
          {a.horizon === 'week' && (
            <label className="vo-check-line"><input type="checkbox" checked={a.nextToday} onChange={(e) => setA({ ...a, nextToday: e.target.checked })} /> Do it today, too</label>
          )}
        </>
      )}
      </fieldset>
      {a && (
        <>
          {saved.length > 0 && !result?.ok && <p className="vo-note">Part of this addition is already saved. Try again to save the remaining lines; edit saved items on their planning page.</p>}
          {rows.length > 0 && (
            <>
              <p className="vo-mini-head">Save will add</p>
              <ul className="vo-review" aria-label="What will be saved">
                {rows.map((r) => <li key={r.id} className={saved.includes(r.id) ? 'is-saved' : ''}><span className="vo-review-where">{whereItGoes(r, labels)}</span><span className="vo-review-title">{r.title}</span></li>)}
              </ul>
            </>
          )}
          {result && !result.ok && <SaveFailure result={result} total={rows.length} />}
          <div className="vo-answer">
            <button type="button" className="vo-primary" onClick={save} disabled={saving || rows.length === 0}>{saving ? 'Saving…' : result && !result.ok ? 'Try again' : 'Save to Symphony'}</button>
            <button type="button" className="vo-link" onClick={() => onOpen?.(PAGE_PATH[a.horizon])} disabled={saving || !onOpen}>Or add it on the {a.horizon === 'week' ? 'Week' : a.horizon === 'today' ? 'Today' : labels[a.horizon]} page</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Review my plan: the existing look-backs ────────────────────────────────

function ReviewHub({ labels, existing, simulated, onReview, onBack }: { labels: PeriodLabels; existing: ExistingPlan; simulated: boolean; onReview?: (k: ReviewKind) => void; onBack: () => void }) {
  const lb = existing.lookBack ?? { month: 0, season: 0 }
  const choices: { kind: ReviewKind; title: string; body: string }[] = [
    { kind: 'month-review', title: `Look back at last month`, body: lb.month ? `${lb.month} ${lb.month === 1 ? 'line' : 'lines'} still open. Carry each into ${labels.month}, mark it done, keep it for someday, or let it go.` : 'Nothing left open.' },
    { kind: 'season-review', title: `Look back at last season`, body: lb.season ? `${lb.season} still open. Decide what carries into ${labels.season}.` : 'Nothing left open.' },
    { kind: 'week', title: 'Check this week', body: `What’s done, what’s left, and what moves — on the Week page.` },
  ]
  return (
    <div className="vo-choose">
      <button type="button" className="vo-quiet vo-back-top" onClick={onBack}><ArrowLeft size={14} aria-hidden /> All choices</button>
      <p className="vo-eyebrow">Review my plan</p>
      <h1 className="vo-title">What would you like to look back at?</h1>
      <p className="vo-lede">These open the reviews Symphony already has. Nothing is deleted, and history is kept.</p>
      <ul className="vo-intents">
        {choices.map((c) => (
          <li key={c.kind}>
            <button type="button" className="vo-intent" onClick={() => onReview?.(c.kind)} disabled={!onReview}>
              <span className="vo-intent-title">{c.title}</span>
              <span className="vo-intent-body">{c.body}</span>
              <ArrowRight className="vo-intent-arrow" size={20} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {simulated && <p className="vo-note">Preview: in the app these open the look-back on the Month or Season page.</p>}
    </div>
  )
}

// ── Finished ───────────────────────────────────────────────────────────────

function Finished({ rows, labels, onOpen, simulated, onAgain }: { rows: PlanRow[]; labels: PeriodLabels; onOpen?: (p: string) => void; simulated: boolean; onAgain: () => void }) {
  const today = rows.filter((r) => r.level === 'today').map((r) => r.title)
  const links = useMemo(() => (['today', 'week', 'month', 'season', 'year'] as Horizon[])
    .filter((h) => (h === 'today' ? today.length > 0 : rows.some((r) => r.level === h)))
    .map((h) => ({ path: PAGE_PATH[h], label: h === 'today' ? 'Open Today' : h === 'week' ? 'See the week' : `${labels[h]} ${h === 'year' ? 'goals' : 'list'}` })), [rows, labels, today.length])
  return (
    <div className="vo-choose vo-done">
      <p className="vo-eyebrow">Plan out loud</p>
      <h1 className="vo-title">{simulated ? 'That’s how it ends' : 'Your plan is in Symphony'}</h1>
      {today.length
        ? <p className="vo-lede">Today: <strong>{today.join(' · ')}</strong>. Everything above it stays on its own list, so the rest of your commitments are there when you want them.</p>
        : <p className="vo-lede">It’s on its lists now. When you’re ready, choose what to do today.</p>}
      {simulated && <p className="vo-note">Preview only — nothing was written.</p>}
      <div className="vo-done-links">
        {links.map((l) => <button key={l.path} type="button" className="vo-link" onClick={() => onOpen?.(l.path)} disabled={simulated}>{l.label}</button>)}
      </div>
      <button type="button" className="vo-quiet" onClick={onAgain}>Back to the start</button>
    </div>
  )
}
