import { useMemo, useState } from 'react'
import { X, NotebookPen, HelpCircle, Target, ChevronLeft, ChevronRight, CalendarCheck2 } from 'lucide-react'
import { parseLocalYmd } from '@/lib/cadence/config'
import { pageMonthStart, pageSeasonStart, planWindowDates, rewindowPlanItems, type PlanDay, type PlanItem, type PlanPlacement, type PageAltitude } from '@/lib/planParse'
import { normalizeSeasons, readSeasons, seasonLabel, nextSeasonStart, seasonStartFor, type Seasons } from '@/lib/cadence/seasons'
import { findLikelyDuplicate, type ExistingTask } from '@/lib/planDuplicates'
import { DOMAINS, type DomainId } from '@/lib/domains'
import type { TitlePeriod } from '@/lib/planTitle'
import type { PageNote } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'
import { TaskKindBadge } from '@/components/task/TaskKindBadge'

export interface PageReviewPayload {
  items: PlanItem[]
  notes: PageNote[]
  /** Which layer the whole page belongs to — asked once, here, and stamped on
   *  everything the page writes. Family is the sharing switch. */
  domain: DomainId
  /** The month a MONTH page is for (its 1st) — the chip's choice. */
  monthStart?: Date
  /** The season a SEASON page is for (its start) — the chip's choice. */
  seasonStart?: Date
}

export interface PageReviewSheetProps {
  /** Parsed actions, in page order. */
  items: PlanItem[]
  /** Parsed prose, in page order. */
  notes: PageNote[]
  /** Lines the model could not read. Read-only until promoted. */
  unclear: string[]
  /** The SAME dates the parser was allowed to place on (local YYYY-MM-DD). */
  windowDates: string[]
  /** Which page this was read as. A year page's lines may be goals. */
  altitude?: PageAltitude
  /** The household's season boundaries (for the season chip). Default: the cached ones. */
  seasons?: Seasons
  /** When the page was snapped — decides which month/season it is for. Default: now. */
  today?: Date
  /** The period the page's own HEADING names — it beats the calendar guess. */
  titlePeriod?: TitlePeriod
  /** The heading as written, so the sheet can say why it opened where it did. */
  pageTitle?: string | null
  /** Open tasks a line might already be — the Link / Keep separate offer. */
  existingTasks?: ExistingTask[]
  /** 'YYYY-MM-DD' → the day's event titles, for day-facts already on the calendar. */
  calendarTitlesByDay?: Map<string, string[]>
  /** The domain to open on. Default: the one remembered for this altitude, else Family. */
  initialDomain?: DomainId
  members: FamilyMember[]
  committing: boolean
  /** Called with only the checked rows, as edited. */
  onCommit: (payload: PageReviewPayload) => void
  onClose: () => void
}

interface ItemRow extends PlanItem {
  included: boolean
  /** The open task this line probably repeats, if any. */
  dup?: ExistingTask | null
  /** "Keep separate" was pressed — the offer is done with. */
  dupDismissed?: boolean
}
interface NoteRow extends PageNote { included: boolean }

const UNASSIGNED = ''

function placementValue(p: PlanPlacement): string {
  return p.kind === 'date' ? p.date : p.kind
}

function placementFromValue(v: string): PlanPlacement {
  switch (v) {
    case 'week': case 'month': case 'season': case 'someday': case 'inbox': case 'goal':
      return { kind: v }
    default:
      return { kind: 'date', date: v }
  }
}

/** The horizon placements every page may use, in ladder order. */
const HORIZON_OPTIONS: { value: PlanPlacement['kind']; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'season', label: 'This season' },
  { value: 'someday', label: 'Someday' },
]

const ALTITUDE_BLURB: Record<PageAltitude, string> = {
  week: 'Check what Symphony read before it changes the week.',
  month: "Read as a month page — undated lines go on the month's list.",
  season: "Read as a season page — undated lines go on the season's list.",
  year: 'Read as a year page — lines become goals for the year.',
}

/** A goal toggle belongs on a row that sits on a month or season list. */
function canBeGoal(altitude: PageAltitude, p: PlanPlacement): boolean {
  return (altitude === 'month' || altitude === 'season') && (p.kind === 'month' || p.kind === 'season')
}

function dateLabel(ymd: string): string {
  return parseLocalYmd(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const DAY_LABEL: Record<PlanDay, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
}

/** A day-fact and a calendar entry rarely word it the same: "No school —
 *  Labor Day" against "Labor Day". Strip the framing and compare what's left. */
function factKey(s: string): string {
  return s.toLowerCase()
    .replace(/no school/g, ' ')
    .replace(/holiday/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Is this day-fact already on the day's calendar? Then it is not news. */
function onCalendar(item: PlanItem, byDay?: Map<string, string[]>): boolean {
  if (!byDay || item.kind !== 'dayfact' || item.placement.kind !== 'date') return false
  const titles = byDay.get(item.placement.date)
  if (!titles?.length) return false
  const a = factKey(item.title)
  if (!a) return false
  return titles.some((t) => {
    const b = factKey(t)
    return !!b && (a.includes(b) || b.includes(a))
  })
}

const DOMAIN_KEY = (altitude: PageAltitude) => `symphony.paper.domain.${altitude}`

function rememberedDomain(altitude: PageAltitude): DomainId | null {
  try {
    const raw = localStorage.getItem(DOMAIN_KEY(altitude))
    return DOMAINS.some((d) => d.id === raw) ? (raw as DomainId) : null
  } catch {
    return null
  }
}

/**
 * The review step of page-from-paper: everything the parser read, editable,
 * nothing written until "Add". Handwriting parsing will misread sometimes —
 * this sheet is where trust in the pipeline lives. Unclear lines sit apart
 * and inert precisely because a wrong task costs more than an unread line.
 */
export function PageReviewSheet({
  items, notes, unclear, windowDates, altitude = 'week', seasons = readSeasons(), today = new Date(),
  titlePeriod = null, pageTitle = null, existingTasks = [], calendarTitlesByDay,
  initialDomain, members, committing, onCommit, onClose,
}: PageReviewSheetProps) {
  // A caller's boundaries may be hand-written and out of calendar order; the
  // season maths below assume ordered ones.
  const seasonsOrdered = useMemo(() => normalizeSeasons(seasons), [seasons])
  // Day-facts the calendar already knows are set aside before anything else:
  // "No school Monday" written on a page whose event is already on the day is
  // a confirmation, not a task.
  const [alreadyOnCalendar] = useState<PlanItem[]>(() => items.filter((i) => onCalendar(i, calendarTitlesByDay)))
  const [itemRows, setItemRows] = useState<ItemRow[]>(() =>
    items
      .filter((i) => !onCalendar(i, calendarTitlesByDay))
      .map((i) => ({ ...i, included: true, dup: findLikelyDuplicate(i.title, existingTasks) })),
  )
  const [noteRows, setNoteRows] = useState<NoteRow[]>(() => notes.map((n) => ({ ...n, included: true })))
  const [unread, setUnread] = useState<string[]>(() => unclear)
  const [domain, setDomain] = useState<DomainId>(() => initialDomain ?? rememberedDomain(altitude) ?? 'family')
  // Which month / season the page is FOR. The page's own heading wins; failing
  // that it is guessed from the date (a page snapped in a month's last week is
  // for the coming month). One tap either way to fix.
  const [monthStart, setMonthStart] = useState<Date>(() =>
    titlePeriod?.kind === 'month' && altitude === 'month' ? titlePeriod.start : pageMonthStart(today))
  const [seasonStart, setSeasonStart] = useState<Date>(() =>
    titlePeriod?.kind === 'season' && altitude === 'season' ? titlePeriod.start : pageSeasonStart(today, seasonsOrdered))

  // The dates this page may place on: a month/season page's window follows the
  // chip, so flipping it opens dates the parser never saw.
  const windowNow = useMemo(() => (
    altitude === 'month' ? planWindowDates(today, 'month', seasonsOrdered, monthStart)
      : altitude === 'season' ? planWindowDates(today, 'season', seasonsOrdered, seasonStart)
        : windowDates
  ), [altitude, today, seasonsOrdered, monthStart, seasonStart, windowDates])

  // Flipping the chip re-places every row against the new window without a
  // second model call: a Dec 12 line degraded off the Fall list becomes a
  // dated row the moment Winter is chosen (and back again).
  const rewindowTo = (periodStart: Date) => {
    const win = planWindowDates(today, altitude, seasonsOrdered, periodStart)
    // rewindowPlanItems returns each row spread, so `included` / `dup` ride along.
    // A row that lands on a date is no longer a goal — goals are never scheduled.
    setItemRows((rows) => (rewindowPlanItems(rows, win, altitude) as ItemRow[])
      .map((r) => (r.goal && !canBeGoal(altitude, r.placement) ? { ...r, goal: false } : r)))
  }
  const shiftMonth = (by: number) => {
    const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + by, 1)
    setMonthStart(next)
    rewindowTo(next)
  }
  const shiftSeason = (by: number) => {
    let next: Date
    if (by > 0) next = nextSeasonStart(seasonStart, seasonsOrdered)
    else {
      const dayBefore = new Date(seasonStart)
      dayBefore.setDate(dayBefore.getDate() - 1)
      next = seasonStartFor(dayBefore, seasonsOrdered)
    }
    setSeasonStart(next)
    rewindowTo(next)
  }

  const includedCount = useMemo(
    () => itemRows.filter((r) => r.included).length + noteRows.filter((r) => r.included).length,
    [itemRows, noteRows],
  )
  const summary = useMemo(() => {
    const includedGoals = itemRows.filter((r) => r.included && (r.placement.kind === 'goal' || r.goal)).length
    const includedItems = itemRows.filter((r) => r.included).length - includedGoals
    const includedNotes = noteRows.filter((r) => r.included).length
    return [
      includedItems > 0 || includedGoals === 0 ? `${includedItems} task${includedItems === 1 ? '' : 's'}` : null,
      includedGoals > 0 ? `${includedGoals} goal${includedGoals === 1 ? '' : 's'}` : null,
      includedNotes > 0 ? `${includedNotes} note${includedNotes === 1 ? '' : 's'}` : null,
      unread.length > 0 ? `${unread.length} unclear` : null,
    ].filter(Boolean).join(' / ')
  }, [itemRows, noteRows, unread.length])
  const isEmpty = itemRows.length === 0 && noteRows.length === 0 && unread.length === 0 && alreadyOnCalendar.length === 0

  const updateItem = (index: number, patch: Partial<ItemRow>) =>
    setItemRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const updateNote = (index: number, patch: Partial<NoteRow>) =>
    setNoteRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const promoteToTask = (line: string) => {
    setItemRows((prev) => [...prev, { title: line, placement: { kind: 'inbox' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task', recurring: null, phone: null, contactMemberId: null, included: true, dup: findLikelyDuplicate(line, existingTasks) }])
    setUnread((prev) => prev.filter((l) => l !== line))
  }
  const promoteToNote = (line: string) => {
    setNoteRows((prev) => [...prev, { title: line, content: line, included: true }])
    setUnread((prev) => prev.filter((l) => l !== line))
  }

  const commit = () => {
    // The house remembers what kind of page this altitude usually is.
    try { localStorage.setItem(DOMAIN_KEY(altitude), domain) } catch { /* private mode */ }
    onCommit({
      domain,
      items: itemRows
        .filter((r) => r.included && r.title.trim())
        .map(({ included: _included, dup: _dup, dupDismissed: _dupDismissed, ...item }) => ({ ...item, title: item.title.trim() })),
      notes: noteRows
        .filter((r) => r.included && r.content.trim())
        .map(({ included: _included, ...note }) => ({ title: note.title.trim(), content: note.content.trim() })),
      ...(altitude === 'month' ? { monthStart } : {}),
      ...(altitude === 'season' ? { seasonStart } : {}),
    })
  }

  // The period chip: ‹ September › / ‹ Fall 2026 › — which list this page fills.
  const periodChip = (altitude === 'month' || altitude === 'season') && (
    <span className="inline-flex items-center gap-0.5 rounded-lg bg-neutral-100 px-1 py-0.5 text-[13px] font-medium text-neutral-700">
      <button type="button" aria-label={altitude === 'month' ? 'Previous month' : 'Previous season'}
        onClick={() => (altitude === 'month' ? shiftMonth(-1) : shiftSeason(-1))}
        className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="px-1">
        {altitude === 'month'
          ? monthStart.toLocaleDateString('en-US', { month: 'long', ...(monthStart.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
          : seasonLabel(seasonStart, seasonsOrdered)}
      </span>
      <button type="button" aria-label={altitude === 'month' ? 'Next month' : 'Next season'}
        onClick={() => (altitude === 'month' ? shiftMonth(1) : shiftSeason(1))}
        className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </span>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Review page items"
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-neutral-200/60">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary-600" />
            <div>
              <h3 className="font-display text-xl text-neutral-900">From your page</h3>
              {!isEmpty && <p className="mt-0.5 text-[13px] text-neutral-500">{ALTITUDE_BLURB[altitude]}</p>}
              {pageTitle && titlePeriod && (
                <p className="mt-0.5 text-[12px] text-neutral-500">Your page says <b className="font-semibold text-neutral-700">{pageTitle}</b></p>
              )}
              {periodChip && <div className="mt-1.5">{periodChip}</div>}
              {!isEmpty && (
                <div role="radiogroup" aria-label="This page is" className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="text-neutral-500">This page is</span>
                  {DOMAINS.map((d) => (
                    <label
                      key={d.id}
                      className={`cursor-pointer rounded-full border px-2.5 py-0.5 font-medium transition-colors ${
                        domain === d.id ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-neutral-200 bg-white text-neutral-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="page-domain"
                        value={d.id}
                        checked={domain === d.id}
                        onChange={() => setDomain(d.id)}
                        aria-label={d.label}
                        className="sr-only"
                      />
                      {d.label}
                    </label>
                  ))}
                  <span className="text-neutral-400">
                    {domain === 'family' ? 'Family pages are shared with everyone in the house.' : 'Only you will see this page.'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close review" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isEmpty ? (
          <div className="px-5 py-10 text-center text-neutral-500 text-[15px]">
            Couldn&rsquo;t read anything on this page. Try a straighter, brighter scan.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
            {summary && (
              <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-3 py-2 text-[13px] text-primary-800">
                <span className="font-semibold">Ready to add:</span> {summary}
              </div>
            )}
            {itemRows.length > 0 && (
              <div className="space-y-2">
                {itemRows.map((row, i) => (
                  <div key={`i-${i}`} className={`flex flex-col gap-2 rounded-xl border border-neutral-200/70 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) => updateItem(i, { included: e.target.checked })}
                        aria-label={`Include "${row.title}"`}
                        className="mt-1 w-4 h-4 accent-primary-600 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          {/* What KIND of line this is stays on the left, always —
                              a goal is a state of the row, not its kind. */}
                          {row.placement.kind === 'goal'
                            ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"><Target className="w-3 h-3" />Goal</span>
                            : row.kind === 'dayfact'
                              ? <span className="inline-flex shrink-0 items-center rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-neutral-500">Day</span>
                              : <TaskKindBadge title={row.title} note={row.note} kind={row.kind === 'recurring' ? 'routine' : undefined} label />}
                          <input
                            value={row.title}
                            onChange={(e) => updateItem(i, { title: e.target.value })}
                            aria-label="Task title"
                            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                          />
                        </div>
                        {row.note && <p className="mt-1 text-[13px] text-neutral-500 line-clamp-2">{row.note}</p>}
                        {/* The same errand, written twice: one tap says which. */}
                        {row.dup && !row.dupDismissed && (
                          row.sourceId
                            ? <p className="mt-1 text-[12px] text-neutral-500">Linked to <i className="text-neutral-700">{row.dup.title}</i></p>
                            : (
                              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-500">
                                Looks like <i className="text-neutral-700">{row.dup.title}</i>
                                <button
                                  type="button"
                                  onClick={() => updateItem(i, { sourceId: row.dup?.id })}
                                  className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 font-medium text-neutral-700 hover:bg-neutral-50"
                                >
                                  Link
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItem(i, { dupDismissed: true })}
                                  className="rounded-md px-1 py-0.5 text-neutral-500 hover:text-neutral-700"
                                >
                                  Keep separate
                                </button>
                              </p>
                            )
                        )}
                      </div>
                    </div>
                    <div className="ml-7 flex flex-wrap items-center gap-2 sm:ml-0 sm:shrink-0 sm:flex-nowrap">
                      {/* A routine has no single day — the pattern IS its when. */}
                      {row.kind === 'recurring' && row.recurring && (
                        <span className="shrink-0 rounded-lg bg-primary-50 px-2 py-1.5 text-[13px] font-medium text-primary-800">
                          Routine · {row.recurring.days.map((d) => DAY_LABEL[d]).join(', ')}
                        </span>
                      )}
                      {row.kind !== 'recurring' && <select
                        value={placementValue(row.placement)}
                        onChange={(e) => {
                          const placement = placementFromValue(e.target.value)
                          // A time only lives on a real date. Moving a row to
                          // This week / Inbox must drop it, or a stale "14:00"
                          // rides along on a row that no longer shows one.
                          // A goal only lives on a month/season list — goals
                          // are never scheduled, so a move off the list
                          // makes it a task again.
                          updateItem(i, {
                            placement,
                            ...(placement.kind === 'date' ? {} : { time: null }),
                            ...(canBeGoal(altitude, placement) ? {} : { goal: false }),
                          })
                        }}
                        aria-label="When"
                        className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0"
                      >
                        {HORIZON_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                        {/* A goal is only offered where it can be written: a year page. */}
                        {(altitude === 'year' || row.placement.kind === 'goal') && <option value="goal">Year goal</option>}
                        {windowNow.map((d) => (
                          <option key={d} value={d}>{dateLabel(d)}</option>
                        ))}
                      </select>}
                      {/* A goal on the month's or season's list — ticked, never
                          placed. A control with a word on it, not a badge. */}
                      {canBeGoal(altitude, row.placement) && row.kind !== 'recurring' && (
                        <button
                          type="button"
                          aria-pressed={!!row.goal}
                          aria-label={`Make "${row.title}" a goal`}
                          title={row.goal ? 'A goal on this list — tap to make it a task' : 'Make it a goal'}
                          onClick={() => updateItem(i, { goal: !row.goal })}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-[13px] font-medium transition-colors ${
                            row.goal ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-neutral-200 bg-white text-neutral-500 hover:text-neutral-800'
                          }`}
                        >
                          <Target className="w-3.5 h-3.5" />{row.goal ? 'Goal' : 'Make a goal'}
                        </button>
                      )}
                      {(row.placement.kind === 'date' || row.kind === 'recurring') && (
                        <input
                          type="time"
                          value={row.time ?? ''}
                          onChange={(e) => updateItem(i, { time: e.target.value || null })}
                          aria-label={`Time for "${row.title}"`}
                          className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0 w-[104px]"
                        />
                      )}
                      {/* A goal has no assignee — it is the household's year, not a chore. */}
                      {row.placement.kind !== 'goal' && <select
                        value={row.assigneeId ?? UNASSIGNED}
                        onChange={(e) => updateItem(i, { assigneeId: e.target.value === UNASSIGNED ? null : e.target.value })}
                        aria-label="Assignee"
                        className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0 max-w-[110px]"
                      >
                        <option value={UNASSIGNED}>Me</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {alreadyOnCalendar.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-500">
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  Already on your calendar
                </p>
                {alreadyOnCalendar.map((fact, i) => (
                  <p key={`c-${i}`} className="rounded-xl border border-dashed border-neutral-200 px-3 py-2 text-[13px] text-neutral-500">
                    {fact.title}
                    {fact.placement.kind === 'date' && <span className="text-neutral-400"> · {dateLabel(fact.placement.date)}</span>}
                  </p>
                ))}
              </div>
            )}

            {noteRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-neutral-500">Notes</p>
                {noteRows.map((row, i) => (
                  <div key={`n-${i}`} className={`flex items-start gap-3 rounded-xl border border-neutral-200/70 px-3 py-2 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateNote(i, { included: e.target.checked })}
                      aria-label={`Include note "${row.title}"`}
                      className="w-4 h-4 accent-primary-600 shrink-0 mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        value={row.title}
                        onChange={(e) => updateNote(i, { title: e.target.value })}
                        aria-label="Note title"
                        className="w-full bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                      />
                      <textarea
                        value={row.content}
                        onChange={(e) => updateNote(i, { content: e.target.value })}
                        aria-label="Note content"
                        rows={3}
                        className="w-full bg-transparent text-[13px] text-neutral-600 focus:outline-none resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unread.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-neutral-500 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Couldn&rsquo;t read these
                </p>
                {unread.map((line) => (
                  <div key={line} className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-3 py-2">
                    <span className="flex-1 min-w-0 text-[14px] text-neutral-500 truncate">{line}</span>
                    <button
                      type="button"
                      onClick={() => promoteToTask(line)}
                      aria-label={`Make "${line}" a task`}
                      className="text-[13px] px-2.5 py-1 rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors shrink-0"
                    >
                      Task
                    </button>
                    <button
                      type="button"
                      onClick={() => promoteToNote(line)}
                      aria-label={`Keep "${line}" as a note`}
                      className="text-[13px] px-2.5 py-1 rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors shrink-0"
                    >
                      Note
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200/60">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[14px] text-neutral-600 hover:bg-neutral-100 transition-colors">
            Cancel
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={commit}
              disabled={committing || includedCount === 0}
              className="btn-primary px-4 py-2 rounded-lg text-[14px] disabled:opacity-50"
            >
              {committing ? 'Adding…' : `Add ${includedCount} ${includedCount === 1 ? 'item' : 'items'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
