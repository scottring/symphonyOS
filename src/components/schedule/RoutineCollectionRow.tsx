import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, SkipForward, Clock, MoreHorizontal, EyeOff, Pencil, CalendarOff } from 'lucide-react'
import type { TimelineItem, CollectionDose } from '@/types/timeline'
import { TaskCheckbox } from './TaskCheckbox'
import type { FamilyMember } from '@/types/family'
import { MultiAssigneeDropdown } from '@/components/family'
import { routineOwners } from '@/lib/routineUtils'
import { ROW_SHELL, ROW_GRID, LANE, MARK, RAIL, RAIL_SLOT } from './todayRowGrid'

interface Props {
  item: TimelineItem // type === 'routine-collection'
  onSelect: () => void
  onSelectStep: (stepTimelineId: string) => void
  onCompleteStep: (stepEntityId: string, completed: boolean) => void
  /** Skip a missed dose — resolves it so the block rolls to the next slot. */
  onSkipStep?: (stepEntityId: string) => void
  /** Complete a dose recording when it was actually done ("did the 7am at 8:15"). */
  onCompleteStepAt?: (stepEntityId: string, completedAt: Date) => void
  /** Pause the whole collection until tomorrow (auto-resumes). */
  onHideToday?: () => void
  /** Archive the whole collection to reference (reactivate on /routines). */
  onRemove?: () => void
  /** Who does it — the same control a task or single routine row carries
   *  (Scott, 2026-09-30: "Ella & Kaleb math time" couldn't be given to them
   *  from Today). */
  familyMembers?: FamilyMember[]
  onAssignAll?: (memberIds: string[]) => void
}

function fmt(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Same label from a Date, for the block's own slot. */
function fmtAt(d: Date): string {
  return fmt(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

/** Compact pill label, e.g. "7a", "10a", "1:30p". */
function fmtShort(t: string | null): string {
  if (!t) return 'anytime'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const hr = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`
}

export function RoutineCollectionRow({ item, onSelect, onSelectStep, onCompleteStep, onSkipStep, onCompleteStepAt, onHideToday, onRemove, familyMembers = [], onAssignAll }: Props) {
  const owners = item.originalRoutine ? routineOwners(item.originalRoutine) : []
  const [open, setOpen] = useState(false)
  const [mgmtOpen, setMgmtOpen] = useState(false)
  const [renderedAt] = useState(() => Date.now())
  // Missed-dose menu: which dose has its Done-now / Done-at / Skip popover open.
  const [menuDoseId, setMenuDoseId] = useState<string | null>(null)
  const [menuTime, setMenuTime] = useState('')
  const p = item.collectionProgress ?? { done: 0, total: 0 }
  const nextUp = item.collectionNextUp
  // Agenda gutter: the next unresolved dose, falling back to the block's own
  // slot once everything is resolved. The time lives in the gutter like every
  // other row rather than trailing the title.
  const gutterLabel = nextUp?.time ? fmt(nextUp.time) : item.startTime ? fmtAt(new Date(item.startTime)) : ''

  const groups = item.collectionSteps ?? []
  const doses = groups.flatMap(g => g.doses)
  // Something to open: more than one step, or one step that is not simply
  // the block again under its own name.
  const expandable = groups.length > 1 || (groups.length === 1 && (groups[0].doses.length > 1 || groups[0].name.trim().toLowerCase() !== item.title.trim().toLowerCase()))
  const allDone = item.completed || (doses.length > 0 && doses.every(d => d.completed || d.skipped) && doses.some(d => d.completed))
  const openDoses = doses.filter(d => !d.completed && !d.skipped)
  const toggleAll = () => {
    if (allDone) { for (const d of doses) if (d.completed) onCompleteStep(d.id, false); return }
    // Leave explicitly-skipped doses alone; complete the rest.
    for (const d of openDoses) onCompleteStep(d.id, true)
  }

  /** A dose whose slot time has passed and is still unresolved. */
  const isPastDue = (dose: CollectionDose): boolean => {
    if (!dose.time || dose.completed || dose.skipped) return false
    const [h, m] = dose.time.split(':').map(Number)
    const doseDate = item.startTime ? new Date(item.startTime) : new Date()
    doseDate.setHours(h, m, 0, 0)
    return doseDate.getTime() < renderedAt
  }

  /** Build a Date on the viewed day at the given HH:MM. */
  const dateAtTime = (time: string): Date => {
    const [h, m] = time.split(':').map(Number)
    const d = item.startTime ? new Date(item.startTime) : new Date()
    d.setHours(h, m, 0, 0)
    return d
  }

  const handleDoseClick = (dose: CollectionDose) => {
    // Completed or skipped → tap undoes (back to pending).
    if (dose.completed || dose.skipped) {
      onCompleteStep(dose.id, false)
      return
    }
    // Missed dose → offer Done now / Done at… / Skip instead of blind-completing.
    if (isPastDue(dose) && (onSkipStep || onCompleteStepAt)) {
      setMenuTime(dose.time ?? '')
      setMenuDoseId((prev) => (prev === dose.id ? null : dose.id))
      return
    }
    onCompleteStep(dose.id, true)
  }
  return (
    // Same wrapper a task/event row uses (px-3 + 1px transparent border), so
    // the columns below line up with them to the pixel and the row picks up the
    // identical hover tint instead of announcing itself with a card.
    <div className={`group ${ROW_SHELL} border-transparent transition-all duration-200 hover:bg-primary-50/50 hover:border-primary-100`}>
      {/* Collapsed: a plain agenda row, not a card. The column widths mirror
          ScheduleItem (pl-5 bulk gutter, w-16 time, w-5 control) so a routine
          lines up with the tasks and events around it. */}
      <div className={`${ROW_GRID} min-w-0`}>
        {/* The same column classes a task row uses, so "For today" (which
            hides the time column) drops it here too — without them the block
            sat 64px right of the tasks above it and read as nested under
            the last one (Scott, 2026-09-28). */}
        <div className={`${gutterLabel ? 'schedule-time-column' : 'schedule-empty-time'} ${LANE} text-xs font-medium tabular-nums text-neutral-500`}>
          {gutterLabel || <span className="text-neutral-300">—</span>}
        </div>
        {/* The block's own check circle, in the column every task's circle
            sits in (Scott, 2026-09-28): a tap completes every open step, and
            a done block taps back to open. */}
        <div className={`${MARK} flex items-center justify-center`}>
          <TaskCheckbox
            completed={allDone}
            onToggleComplete={toggleAll}
            onToggleWaiting={() => {}}
            shape="circle"
            label={allDone ? `Mark ${item.title} not done` : `Mark all of ${item.title} done`}
          />
        </div>
        {/* Inline padding: a phone-wide rule pads every button 25px a side for
            touch, which left this name 42px of its 93px column (2026-09-21).
            The row itself is the target; the name needs no padding. */}
        <button
          onClick={() => (expandable ? setOpen(o => !o) : onSelect())}
          {...(expandable ? { 'aria-expanded': open } : {})}
          className="flex-1 min-w-0 py-1.5 text-left"
          style={{ paddingLeft: 0, paddingRight: 0 }}
        >
          {/* The name takes the room that is left, rather than half of it: at
              390px the time gutter, circle and action rail leave ~93px, and
              `max-w-[50%]` rendered "Kids Bedtime routine" as "K.." (2026-09-19).
              The chevron trails the name, and only when there are steps to
              show — a block whose one step is itself has nothing to open. */}
          <span className={`min-w-0 line-clamp-2 break-words text-[16px] leading-snug font-medium ${allDone ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
            {item.title}
            {expandable && (open
              ? <ChevronDown aria-hidden className="inline-block w-4 h-4 ml-1 -mt-0.5 text-neutral-400" />
              : <ChevronRight aria-hidden className="inline-block w-4 h-4 ml-1 -mt-0.5 text-neutral-400" />)}
          </span>
          {/* One muted line under the name, the same place every other row
              keeps its context: how many steps, and the next one. */}
          {expandable && (
            <span className="block truncate text-[12px] leading-tight text-neutral-500 mt-0.5">
              {p.total} {p.total === 1 ? 'step' : 'steps'}
              {item.completed
                ? ' · done'
                : p.done > 0
                  ? ` · ${p.done} done${nextUp ? ` · next: ${nextUp.stepName}` : ''}`
                  : nextUp ? ` · next: ${nextUp.stepName}` : ''}
            </span>
          )}
        </button>
        {/* Who: shown when someone is on it, and on hover when no one is —
            the task rows' rule. */}
        {/* The same four-cell rail a task row draws (who · context · verb ·
            ⋯), so a routine's people sit in the task rows' people column
            instead of wherever its name happened to end. */}
        <div className={RAIL}>
        <div className={`shrink-0 md:w-[5.25rem] md:h-7 md:flex md:items-center md:justify-end transition-opacity ${owners.length ? '' : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'}`}>
          {onAssignAll && familyMembers.length > 0 && (
            <MultiAssigneeDropdown members={familyMembers} selectedIds={owners} onSelect={onAssignAll} size="sm"
              label="Who's responsible?" triggerLabel={`Assign people to ${item.title}`} />
          )}
        </div>
        <div className={`hidden md:flex ${RAIL_SLOT}`} aria-hidden />
        <div className={`hidden md:flex ${RAIL_SLOT}`} aria-hidden />
        {/* Management menu: hide-for-today / edit / archive, mirroring task
            rows — and like theirs, quiet until you reach for it on desktop. */}
        <div className={`relative ${RAIL_SLOT} transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100`}>
          <button
            aria-label="Routine options"
            onClick={() => setMgmtOpen(o => !o)}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {mgmtOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMgmtOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {onHideToday && (
                  <button
                    role="menuitem"
                    onClick={() => { onHideToday(); setMgmtOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <EyeOff className="w-4 h-4 text-neutral-400" /> Hide for today
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => { onSelect(); setMgmtOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <Pencil className="w-4 h-4 text-neutral-400" /> Edit routine
                </button>
                {onSkipStep && !allDone && openDoses.length > 0 && (
                  <button
                    role="menuitem"
                    onClick={() => { for (const d of openDoses) onSkipStep(d.id); setMgmtOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <SkipForward className="w-4 h-4 text-neutral-400" /> Skip the rest today
                  </button>
                )}
                {onRemove && (
                  <button
                    role="menuitem"
                    onClick={() => { onRemove(); setMgmtOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <CalendarOff className="w-4 h-4 text-neutral-400" /> Remove from Today
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </div>
      {/* Expanded steps start under the name (Scott, 2026-09-28: the old
          list sat a card's width to the right and a bulk-action line below
          the name). The spacers mirror the header's columns, so For today —
          which hides the time column — lines them up too. Each step is one
          line: an untimed step's circle leads it like a task's; timed doses
          trail the name as pills. Completing or skipping everything lives on
          the block's own circle and its ⋯ menu. */}
      {open && expandable && (
        <div className="flex gap-3 pl-5 md:pl-0">
          <div className={`schedule-empty-time ${LANE}`} />
          <div className={MARK} />
          <ul className="flex-1 min-w-0 space-y-1.5 pb-1.5">
          {groups.map(group => {
            const stepDone = group.progress.done === group.progress.total && group.progress.total > 0
            const untimedOnly = group.doses.every(d => !d.time)
            const doseControls = (
              <span className="flex flex-wrap items-center gap-1 shrink-0">
                  {group.doses.map(dose => {
                  const pastDue = isPastDue(dose)
                  const untimed = !dose.time
                  const label = dose.completed
                    ? `Uncomplete ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                    : dose.skipped
                    ? `Unskip ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                    : pastDue
                    ? `Resolve missed ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                    : `Complete ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                  return (
                    <span key={dose.id} className="relative">
                      {untimed ? (
                        // Untimed dose: no time to show, so render the app's
                        // standard check circle (same shape/size/border
                        // language as TaskCheckbox) instead of a text pill —
                        // an "anytime" pill didn't read as tappable. Colors
                        // are the same ones the pill already used per state,
                        // just carried by a circle instead of pill text.
                        <button
                          onClick={() => handleDoseClick(dose)}
                          aria-label={label}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            dose.completed
                              ? 'bg-primary-500 border-primary-500 text-white'
                              : dose.skipped
                              ? 'bg-neutral-100 border-neutral-300 text-neutral-400'
                              : pastDue
                              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-400'
                              : 'bg-bg-base border-neutral-300 hover:border-primary-400'
                          }`}
                        >
                          {dose.completed ? (
                            <Check className="w-3 h-3" strokeWidth={3} />
                          ) : dose.skipped ? (
                            <SkipForward className="w-2.5 h-2.5" />
                          ) : null}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDoseClick(dose)}
                          aria-label={label}
                          className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            dose.completed
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : dose.skipped
                              ? 'bg-neutral-100 border-neutral-200 text-neutral-400 line-through'
                              : pastDue
                              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-400'
                              : 'bg-bg-base border-neutral-300 text-neutral-600 hover:border-primary-300'
                          }`}
                        >
                          {fmtShort(dose.time)}
                        </button>
                      )}

                      {menuDoseId === dose.id && (
                        <>
                          {/* Click-away backdrop */}
                          <span
                            className="fixed inset-0 z-10"
                            aria-hidden
                            onClick={() => setMenuDoseId(null)}
                          />
                          <span
                            role="menu"
                            aria-label={`Missed ${group.name} options`}
                            className="absolute z-20 top-full left-0 mt-1 w-48 rounded-xl border border-neutral-200 bg-white shadow-lg p-1.5 flex flex-col gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => { onCompleteStep(dose.id, true); setMenuDoseId(null) }}
                              className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] text-neutral-700 hover:bg-neutral-50"
                            >
                              <Check className="w-3.5 h-3.5 text-primary-600" /> Done now
                            </button>
                            {onCompleteStepAt && (
                              <span className="flex items-center gap-1.5 px-2.5 py-1">
                                <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                <input
                                  type="time"
                                  value={menuTime}
                                  onChange={(e) => setMenuTime(e.target.value)}
                                  aria-label="Time you did it"
                                  className="flex-1 min-w-0 text-[12px] rounded-md border border-neutral-200 px-1.5 py-0.5 text-neutral-700"
                                />
                                <button
                                  disabled={!menuTime}
                                  onClick={() => { onCompleteStepAt(dose.id, dateAtTime(menuTime)); setMenuDoseId(null) }}
                                  className="text-[12px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-40"
                                >
                                  Did then
                                </button>
                              </span>
                            )}
                            {onSkipStep && (
                              <button
                                onClick={() => { onSkipStep(dose.id); setMenuDoseId(null) }}
                                className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] text-neutral-500 hover:bg-neutral-50"
                              >
                                <SkipForward className="w-3.5 h-3.5 text-neutral-400" /> Skip this one
                              </button>
                            )}
                          </span>
                        </>
                      )}
                    </span>
                  )
                })}
              </span>
            )
            return (
              <li key={group.stepId} className="flex items-center gap-2.5 min-w-0">
                {untimedOnly && doseControls}
                <button
                  type="button"
                  className={`min-w-0 text-left text-[15px] leading-snug truncate cursor-pointer ${stepDone ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}
                  onClick={() => onSelectStep(`routine-${group.stepId}`)}
                >
                  {group.name}
                </button>
                {!untimedOnly && doseControls}
              </li>
            )
          })}
          </ul>
        </div>
      )}
    </div>
  )
}
