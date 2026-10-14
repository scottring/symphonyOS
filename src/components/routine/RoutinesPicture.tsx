// src/components/routine/RoutinesPicture.tsx
//
// The Routines page: a picture of the household's rhythm, not a settings page
// (spec 2026-10-14-routines-talk-first, frame "After 1"; phone frame "Phone").
//
//   header       "‹ OUR RHYTHM · WEEK OF OCT 10 ›", the title, one sentence
//                from the rules (rhythmSentence)
//   Every day    routines whose pattern names all seven days, written once
//   the grid     the week's days in the household's order × Morning,
//                Afternoon, Evening and Any time; this week's saved changes
//                (skipped, moved, someone else) in place with a "this week"
//                mark. Occurrences come from buildWeekRoutineItems, as on Week.
//   the lines    Each month (not weekly), No day yet, Not showing (resting or
//                off), so every routine stays reachable.
//
// Tap a routine: its panel, for that day. Drag one day's occurrence to another
// day (desktop): that occurrence moves, with Undo. A pending change card is
// drawn dashed (routinesPreview). Changing routines is a conversation: the bar
// offers "Change our routines"; a small New routine link stays for anyone who
// never talks to it.

import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { Layer } from '@/lib/domains'
import { ALL_LAYERS } from '@/lib/domains'
import { localYmd, parseLocalYmd, useCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { isPlanDrag, readPlanDrag, writePlanDrag } from '@/lib/planning/planDrag'
import { buildWeekRoutineItems } from '@/components/home/week/weekRoutineItems'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { BANDS, buildOccurrences, clock, dayList, layoutPicture, type Chip, type Occurrence } from './picture/routinesPicture'
import { previewPicture } from './picture/routinesPreview'
import { rhythmSentence } from './picture/rhythmSentence'
import '@/styles/routines-picture.css'

export interface RoutinesPictureProps {
  /** The routines in the areas being viewed, Steps included. */
  routines: Routine[]
  loading?: boolean
  /** Routines exist but the area filter hides all of them. */
  hiddenByFilter?: boolean
  onShowAllDomains?: () => void
  familyMembers?: FamilyMember[]
  layers?: ReadonlySet<Layer>
  /** Phones have no conversation bar: the page offers the walk itself. */
  walk?: { label: string; onStart: () => void }
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function RoutinesPicture({ routines, loading = false, hiddenByFilter = false, onShowAllDomains, familyMembers = [], layers = ALL_LAYERS, walk }: RoutinesPictureProps) {
  const phone = useMediaQuery('(max-width: 767px)')
  const { config } = useCadenceConfig()
  const thisWeek = weekStartAnchor(new Date(), config.weekStartsOn)
  const [chosenWeek, setChosenWeek] = useState<Date | null>(null)
  const weekStart = chosenWeek ?? thisWeek
  const isCurrent = weekStart.getTime() === thisWeek.getTime()
  const weekMs = weekStart.getTime()
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(weekMs), i)), [weekMs])
  const todayKey = localYmd(new Date())

  const instances = useWeekInstances(weekStart, 7)
  const { reschedule, undoReschedule } = useActionableInstances()
  const activity = useCanvasActivity()
  const selection = useSelectionOptional()

  const memberById = useMemo(() => new Map(familyMembers.map((m) => [m.id, m])), [familyMembers])
  const stepCounts = useMemo(() => new Map(groupRoutineSteps(routines).collections.map((c) => [c.id, c.steps.length])), [routines])
  const routinesById = useMemo(() => new Map(routines.map((r) => [r.id, r])), [routines])
  const topLevel = useMemo(() => routines.filter((r) => !r.parent_routine_id), [routines])

  // The week's occurrences, from the same builder Week uses.
  const base = useMemo(() => {
    const items = buildWeekRoutineItems({ routines, weekStart: new Date(weekMs), dayCount: 7, instances, prefs: { hideRoutines: false, layers } })
    return buildOccurrences({ items, days, instances, stepCounts, nameOf: (id) => memberById.get(id)?.name })
  }, [routines, weekMs, instances, layers, days, stepCounts, memberById])
  const sentence = useMemo(() => rhythmSentence(days, base), [days, base])
  // A pending change card, drawn dashed.
  const preview = useMemo(
    () => previewPicture({ occurrences: base, set: activity.changeSet, days, routines: routinesById, stepCounts }),
    [base, activity.changeSet, days, routinesById, stepCounts],
  )
  const picture = useMemo(
    () => layoutPicture({ routines: topLevel, occurrences: preview.occurrences, days, stepCounts, lineMarks: preview.lineMarks, newChips: preview.newChips }),
    [topLevel, preview, days, stepCounts],
  )

  // ── tap and drag ─────────────────────────────────────────────────────
  const open = (routineId: string, dayKey?: string) =>
    selection?.setSelection({ kind: 'routine', id: routineId, ...(dayKey ? { date: dayKey } : {}) })
  const [overDay, setOverDay] = useState<string | null>(null)
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  const move = (o: Occurrence, to: Date) => {
    const from = parseLocalYmd(o.dayKey)
    const when = o.time ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), o.time.getHours(), o.time.getMinutes()) : to
    const opts: { ids: string[]; undo?: () => Promise<boolean | void> } = { ids: [o.routineId] }
    void activity.run(`Move “${o.title}” to ${to.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, async () => {
      // This occurrence only: the routine's rule is never rewritten by a drag.
      const previous = await reschedule('routine', o.routineId, from, when, o.time ? undefined : { dayOnly: true })
      if (previous) opts.undo = async () => { await undoReschedule(previous) }
      return !!previous
    }, opts)
  }
  const dayDrop = (day: Date) => {
    const key = localYmd(day)
    return {
      onDragOver: (e: DragEvent) => {
        if (!isPlanDrag(e.dataTransfer)) return
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'
        if (overDay !== key) setOverDay(key)
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setOverDay((k) => (k === key ? null : k))
      },
      onDrop: (e: DragEvent) => {
        setOverDay(null)
        const p = readPlanDrag(e.dataTransfer)
        if (!p || p.kind !== 'routine') return
        e.preventDefault()
        const o = base.find((x) => x.routineId === p.id && x.dayKey === p.date)
        if (o && p.date !== key) move(o, day)
      },
    }
  }

  // ── pieces ───────────────────────────────────────────────────────────
  const faces = (people: string[]) => {
    const who = people.flatMap((id) => { const m = memberById.get(id); return m ? [m] : [] })
    return who.length > 0 && (
      <span className="rp-faces" aria-label={who.map((m) => m.name).join(', ')}>
        {who.slice(0, 4).map((m) => <AssigneeAvatar key={m.id} member={m} size="sm" className="rp-avatar" />)}
      </span>
    )
  }
  const steps = (n: number) => n > 0 && <span className="rp-steps">{n} {n === 1 ? 'step' : 'steps'}</span>
  const row = (o: Occurrence) => {
    const skipped = !!o.exception?.kinds.includes('skipped')
    const struck = skipped || !!o.struck
    const body = (
      <>
        <span className="rp-time">{o.time ? clock(o.time) : ''}</span>
        <span className="rp-glyph" aria-hidden="true" />
        <span className="rp-text">
          <span className="rp-title">{struck ? <s>{o.title}</s> : o.title}</span>
          {faces(o.people)}
          {steps(o.steps)}
          {o.exception && !o.preview && <span className="rp-once">This week · {o.exception.label}</span>}
          {o.previewNote && <span className="rp-note">{o.previewNote}</span>}
        </span>
      </>
    )
    if (o.preview) {
      return (
        <li key={o.key} className={`rp-row is-${o.preview}`} data-testid={`${o.preview}-row`}>
          <span className="rp-open">{body}</span>
          <span className="sr-only"> ({o.preview === 'leaving' ? 'leaving' : 'proposed'}, not saved yet)</span>
        </li>
      )
    }
    return (
      <li key={o.key} className={`rp-row${o.exception ? ' is-exception' : ''}`}>
        <button type="button" className="rp-open" draggable={!phone}
          onDragStart={(ev) => writePlanDrag(ev.dataTransfer, { kind: 'routine', id: o.routineId, date: o.dayKey, title: o.title })}
          onDragEnd={() => setOverDay(null)}
          onClick={() => open(o.routineId, o.dayKey)}>
          {body}
        </button>
      </li>
    )
  }
  const chip = (c: Chip) => {
    const inner = (
      <>
        {c.time && <span className="rp-time">{clock(c.time)}</span>}
        <span className="rp-glyph" aria-hidden="true" />
        <span className="rp-pill-title">{c.title}</span>
        {steps(c.steps)}
        {c.hint && <span className="rp-hint">{c.hint}</span>}
        {faces(c.people)}
      </>
    )
    return c.preview
      ? <li key={c.key} className={`rp-pill is-${c.preview}`} data-testid={`${c.preview}-chip`}><span className="rp-pill-open">{inner}</span><span className="sr-only"> (not saved yet)</span></li>
      : <li key={c.key} className="rp-pill"><button type="button" className="rp-pill-open" onClick={() => open(c.routineId)}>{inner}</button></li>
  }
  const line = (label: string, chips: Chip[], quiet = false) => chips.length > 0 && (
    <section className={`rp-line${quiet ? ' is-quiet' : ''}`} aria-label={label}>
      <h2 className="rp-line-label">{label}</h2>
      <ul className="rp-pills">{chips.map(chip)}</ul>
    </section>
  )

  // ── the page ─────────────────────────────────────────────────────────
  const empty = !loading && routines.length === 0
  const eyebrow = (
    <PeriodNavEyebrow label={`Our rhythm · week of ${monthDay(weekStart)}`}
      onPrev={() => setChosenWeek(addDays(weekStart, -7))} onNext={() => setChosenWeek(addDays(weekStart, 7))}
      prevLabel={`Week of ${monthDay(addDays(weekStart, -7))}`} nextLabel={`Week of ${monthDay(addDays(weekStart, 7))}`}
      trailing={isCurrent ? undefined : (
        <button type="button" onClick={() => setChosenWeek(null)}
          className="period-return ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-600 transition-colors hover:bg-primary-100">Back to this week</button>
      )} />
  )
  const tools = (
    <div className="rp-tools">
      {walk && <button type="button" className="canvas-walk" onClick={walk.onStart}>{walk.label}</button>}
      <Link to="/routines/new" className="canvas-link rp-new">New routine</Link>
    </div>
  )
  const bandsInUse = BANDS.filter((b) => picture.days.some((d) => d.bands[b.id].length > 0))
  const selectedKey = chosenDay && picture.days.some((d) => d.key === chosenDay) ? chosenDay : (picture.days.find((d) => d.key === todayKey) ?? picture.days[0]).key

  return (
    <div className="h-full overflow-auto">
      <div className={`relative ${PAGE_PLANNING} rp`}>
        <MastheadCard variant="page" eyebrow={eyebrow} title="Routines"
          subline={sentence ? <span className="rp-sentence" data-explain="rhythm-sentence" data-explain-label="The week in a sentence">{sentence}</span> : undefined}
          footer={tools} />

        {loading && routines.length === 0 && <EmptyState title="Loading your routines…" />}

        {empty && hiddenByFilter && (
          <EmptyState title="No routines in the areas you're viewing"
            action={onShowAllDomains ? (
              <button type="button" onClick={onShowAllDomains}
                className="rounded-md px-3 py-2 text-[14px] text-primary-700 transition-colors hover:bg-primary-50">Show all domains</button>
            ) : undefined}>
            Your other routines are hidden by the domain filter.
          </EmptyState>
        )}

        {empty && !hiddenByFilter && (
          <section aria-label="No routines yet" className="canvas-group rp-empty">
            <h2 className="rp-empty-title">No routines yet</h2>
            <p className="rp-empty-text">A routine is something your household does again and again: mornings, bedtime, the weekly reset. Tell Symphony how your days run, or add one with New routine.</p>
          </section>
        )}

        {routines.length > 0 && (phone ? (
          <div className="rp-phone">
            <div className="wc-daychips" role="group" aria-label="Days">
              {picture.days.map((d) => (
                <button key={d.key} type="button" className={`wc-daychip${d.key === todayKey ? ' is-today' : ''}`} aria-pressed={d.key === selectedKey}
                  aria-label={longDay(d.date)} onClick={() => setChosenDay(d.key)}>
                  <span className="wc-daychip-name">{shortDay(d.date)}</span>
                  <span className="wc-daychip-num">{d.date.getDate()}</span>
                </button>
              ))}
            </div>
            {(() => {
              const list = dayList(preview.occurrences, selectedKey)
              return list.length
                ? <ul className="rp-daylist" aria-label={longDay(parseLocalYmd(selectedKey))}>{list.map(row)}</ul>
                : <p className="rp-quiet">Nothing regular on {parseLocalYmd(selectedKey).toLocaleDateString('en-US', { weekday: 'long' })}.</p>
            })()}
            {line('Every day', picture.everyDay.filter((c) => c.preview))}
            {line('Each month', picture.lessOften)}
            {line('No day yet', picture.noDay)}
            {line('Not showing', picture.notShowing, true)}
          </div>
        ) : (
          <div className="rp-picture">
            {line('Every day', picture.everyDay)}
            <div className="rp-grid" role="group" aria-label="The week">
              <div className="rp-corner" aria-hidden="true" />
              {picture.days.map((d) => (
                <div key={d.key} className={`rp-dayhead${d.key === todayKey ? ' is-today' : ''}${overDay === d.key ? ' is-over' : ''}`} {...dayDrop(d.date)}>
                  <span className="rp-dayname">{shortDay(d.date)}</span><b className="rp-daynum">{d.date.getDate()}</b>
                </div>
              ))}
              {bandsInUse.map((b) => (
                <div key={b.id} className="contents" role="group" aria-label={b.label}>
                  <h2 className="rp-band">{b.label}</h2>
                  {picture.days.map((d) => (
                    <div key={d.key} className={`rp-cell${d.key === todayKey ? ' is-today' : ''}${overDay === d.key ? ' is-over' : ''}`}
                      data-testid={`cell-${b.id}-${d.key}`} aria-label={`${d.date.toLocaleDateString('en-US', { weekday: 'long' })} ${b.label.toLowerCase()}`} {...dayDrop(d.date)}>
                      {d.bands[b.id].length > 0 && <ul className="rp-rows">{d.bands[b.id].map(row)}</ul>}
                    </div>
                  ))}
                </div>
              ))}
              {bandsInUse.length === 0 && <p className="rp-quiet rp-grid-empty">Nothing weekly this week.</p>}
            </div>
            {line('Each month', picture.lessOften)}
            {line('No day yet', picture.noDay)}
            {line('Not showing', picture.notShowing, true)}
          </div>
        ))}
      </div>
    </div>
  )
}
