// src/components/plan/PeriodShelves.tsx
//
// The Shelves a planning period shows: the level above as a read-only rail, the
// slower routines relevant to the period, and what is actually on the calendar
// inside it.
//
// Lifted OUT of `PeriodPlanPage` unchanged (2026-09-24) so a goal's own detail
// page can show its period's Shelves instead of falling back to today's task
// chooser — Scott: "An October goal should show October's Shelves, including
// the season reference and calendar—not today's task chooser. Reuse the Month
// page's existing Shelves behavior." The JSX is a verbatim move; every prop
// below is a value the page already computed. Nothing here is new behaviour.

import type { ReactNode } from 'react'
import { X, Repeat, ChevronDown, ChevronRight } from 'lucide-react'
import { PlanRail } from './PlanRail'
import type { PlanRowModel } from './PlanRow'
import type { PlanLevel } from '@/lib/planning/periodPage'
import type { PeriodCalendarEntry } from '@/lib/planning/periodCalendar'
import { formatShortDate } from '@/lib/dateHelpers'

const TITLE: Record<PlanLevel, string> = { month: 'This Month', season: 'This Season', year: 'This Year' }
const NOUN: Record<PlanLevel, string> = { month: 'month', season: 'season', year: 'year' }

export interface PeriodShelvesProps {
  /** The period these Shelves belong to. */
  level: PlanLevel
  bounds: { label: string }
  /** The level above, when there is one; drives the rail and the header note. */
  above: PlanLevel | null
  railBounds: { label: string } | null
  railRows: PlanRowModel[]
  /** The period's noun — "month", "season", "year". */
  noun: string
  patterns: { id: string; name: string; cadence: string }[]
  routinesHeading: string
  routinesOpen: boolean
  toggleRoutines: () => void
  dated: PeriodCalendarEntry[]
  calendarOpen: boolean
  toggleCalendar: () => void
  eventsAvailable: boolean
  eventsCoverPeriod: boolean
  onOpen: (row: PlanRowModel) => void
  /** Month only on the plan page; omitted where there is nothing to pull into. */
  onPullDown?: (row: PlanRowModel) => void
  onNavigate: (to: string) => void
  onClose: () => void
}

export function PeriodShelves({
  level, bounds, above, railBounds, railRows, noun, patterns, routinesHeading,
  routinesOpen, toggleRoutines, dated, calendarOpen, toggleCalendar,
  eventsAvailable, eventsCoverPeriod, onOpen, onPullDown, onNavigate, onClose,
}: PeriodShelvesProps): ReactNode {
  return (
<aside aria-label="Shelves" className="period-shelves">
            <header><div className="flex items-start justify-between gap-3"><h2 className="font-display text-xl text-neutral-800">Shelves</h2><button type="button" data-close-period-shelves aria-label="Close shelves" onClick={onClose} className="p-2 text-neutral-500"><X className="h-4 w-4" /></button></div>
              <p className="mt-1 text-[13px] text-neutral-500">{bounds.label}</p>
              <p className="period-section-note">{above ? `Keep the ${NOUN[above]} in view as you plan this ${noun}.` : 'Recurring commitments to consider alongside your goals.'}</p></header>
            {!above && patterns.length === 0 && <p className="period-section-note">No recurring commitments to reference for this year.</p>}
            {above && railBounds && (
              <PlanRail
                title={TITLE[above]}
                subtitle={railBounds.label}
                rows={railRows}
                onOpen={onOpen}
                onPullDown={onPullDown}
                pullLabel="Add to this month:"
                emptyCopy={`Nothing on this ${NOUN[above]}'s list.`}
                storageKey={`symphony-plan-rail-${level}`}
              />
            )}
            {patterns.length > 0 && (
              <section aria-label={routinesHeading} className="min-w-0 border-t border-neutral-200 pt-2.5">
                <button
                  type="button"
                  onClick={toggleRoutines}
                  aria-expanded={routinesOpen}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  {routinesOpen
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                  {/* Routines carry no history — there is no record of which
                      patterns were active in August — so only the CURRENT
                      period may claim to be showing its own (review
                      2026-09-13). Elsewhere the heading says what this
                      truthfully is. */}
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{routinesHeading}</h2>
                  <span className="text-xs text-neutral-400">{`· ${patterns.length}`}</span>
                </button>
                {routinesOpen && (
                  <>
                    <ul className="mt-1.5 divide-y divide-neutral-100">
                      {patterns.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => onNavigate(`/routines/${r.id}`)}
                            className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-neutral-50"
                          >
                            <Repeat className="mt-[3px] h-3 w-3 shrink-0 text-neutral-300" />
                            <span className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-700">
                              {r.name}
                              <span className="text-neutral-400"> · {r.cadence}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 px-1.5 text-[11px] leading-snug text-neutral-400">
                      {/* No promise that an occurrence can be ticked: an
                          untimed routine has no occurrence anywhere yet. */}
                      Slower routines relevant to this period, based on current patterns. Manage all routines in Routines.
                    </p>
                  </>
                )}
              </section>
            )}
            {dated.length > 0 && (
              <section aria-label="On the calendar" className="min-w-0 border-t border-neutral-200 pt-2.5">
                <button
                  type="button"
                  onClick={toggleCalendar}
                  aria-expanded={calendarOpen}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  {calendarOpen
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-neutral-400" />}
                  <h2 className="text-xs font-semibold tracking-wide uppercase text-neutral-500">On the calendar</h2>
                  <span className="text-xs text-neutral-400">{`· ${dated.length}`}</span>
                </button>
                {calendarOpen && (
                  <ul className="mt-1.5 divide-y divide-neutral-100">
                    {dated.map((entry) => (
                      <li key={entry.id}>
                        {entry.taskId ? (
                          <button
                            type="button"
                            onClick={() => onNavigate(`/task/${entry.taskId}`)}
                            className="w-full rounded-md px-1.5 py-1 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50"
                          >
                            {formatShortDate(entry.at)} · {entry.title}
                            {!entry.allDay && ` · ${entry.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                          </button>
                        ) : (
                          <div className="px-1.5 py-1 text-[13px] text-neutral-700">
                            {formatShortDate(entry.at)} · {entry.title}
                            {!entry.allDay && ` · ${entry.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {calendarOpen && (!eventsAvailable || !eventsCoverPeriod) && (
                  <p className="mt-1.5 px-1.5 text-[12px] text-neutral-500">
                    {eventsAvailable
                      ? 'Calendar events are shown for the next few weeks only; further out, this is dated tasks alone.'
                      : "Couldn't reach the calendar, so this is dated tasks alone."}
                  </p>
                )}
              </section>
            )}
          </aside>
  )
}
