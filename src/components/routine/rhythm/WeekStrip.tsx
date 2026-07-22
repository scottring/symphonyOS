import { useState } from 'react'
import { ChevronDown, Power } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import type { DayKey } from './rhythmModel'
import { DAY_ORDER, resolveMembers } from './rhythmModel'
import { QuickAddInput } from './QuickAddInput'

export interface WeekStripProps {
  days: Record<DayKey, Routine[]>
  sometime: Routine[]
  stepCounts: Record<string, number>
  matches: (r: Routine) => boolean
  todayKey: DayKey
  onOpenRoutine: (r: Routine) => void
  familyMembers?: FamilyMember[]
  /** Steps per collection id — enables the expand chevron on collection chips. */
  collectionSteps?: Record<string, Routine[]>
  /** Every-day routines mirrored into the columns (toggleable). */
  dailyItems?: Routine[]
  /** Resting routines ghosted into their day column. */
  restingDays?: Record<DayKey, Routine[]>
  /** Flick a sleeping routine back to active. */
  onWake?: (r: Routine) => void
  /** Create a new weekly routine inline on a specific day column. */
  onQuickAdd?: (name: string, day: DayKey) => void
  /** Add a step to a collection inline from its expanded chip. */
  onAddStep?: (collectionId: string, name: string) => void
}

const DAY_LABEL: Record<DayKey, string> = {
  sun: 'SUN', mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT',
}

const FULL_THRESHOLD = 4

/** Does an every-day-zone routine actually occur on this weekday? */
function occursOn(r: Routine, day: DayKey): boolean {
  const p = r.recurrence_pattern
  if (p.type === 'daily') return true
  if (p.type === 'weekly') return (p.days ?? []).includes(day)
  return false
}

function Chip({ r, stepCounts, matches, onOpen, familyMembers, steps, onAddStep }: {
  r: Routine; stepCounts: Record<string, number>; matches: (r: Routine) => boolean; onOpen: (r: Routine) => void
  familyMembers: FamilyMember[]; steps: Routine[]; onAddStep?: (collectionId: string, name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const stepCount = stepCounts[r.id]
  const biweekly = r.recurrence_pattern.type === 'weekly' && r.recurrence_pattern.interval === 2
  const members = resolveMembers(r, familyMembers)
  return (
    <div
      className={`w-full rounded-lg bg-emerald-50/60 px-2 py-1.5 text-xs text-neutral-700
                  transition-colors ${matches(r) ? '' : 'opacity-30'}`}
    >
      <div className="flex items-start gap-1">
        <button onClick={() => onOpen(r)} className="flex-1 min-w-0 text-left hover:text-emerald-900">
          <span className="line-clamp-2">{r.name}</span>
        </button>
        {steps.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Hide steps' : 'Show steps'}
            className="flex-shrink-0 rounded p-0.5 text-neutral-400 hover:bg-emerald-100 hover:text-neutral-600 transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {(stepCount || biweekly || members.length > 0) && (
        <span className="mt-0.5 flex items-center justify-between gap-1">
          <span className="text-[10px] text-neutral-400">
            {stepCount ? `${stepCount} steps` : ''}{stepCount && biweekly ? ' · ' : ''}{biweekly ? 'every 2 wks' : ''}
          </span>
          {members.length > 0 && (
            <span className="flex -space-x-1.5">
              {members.map(m => (
                <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
              ))}
            </span>
          )}
        </span>
      )}
      {expanded && (
        <div className="mt-1.5 border-l-2 border-emerald-200 pl-2 flex flex-col gap-0.5">
          {steps.map(s => (
            <div key={s.id} className="text-[10px] leading-snug text-neutral-500">{s.name}</div>
          ))}
          {onAddStep && (
            <QuickAddInput
              label={`Add step to ${r.name}`}
              placeholder="New step"
              onSubmit={name => onAddStep(r.id, name)}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function WeekStrip({ days, sometime, stepCounts, matches, todayKey, onOpenRoutine, familyMembers = [], collectionSteps = {}, dailyItems = [], restingDays, onWake, onQuickAdd, onAddStep }: WeekStripProps) {
  // Every-day items are visible by default; the preference persists per browser.
  const [showDaily, setShowDaily] = useState(() => localStorage.getItem('rhythm-week-show-daily') !== '0')
  const toggleDaily = () => setShowDaily(v => {
    localStorage.setItem('rhythm-week-show-daily', v ? '0' : '1')
    return !v
  })
  // Same deal for ghosted resting (asleep) routines.
  const [showResting, setShowResting] = useState(() => localStorage.getItem('rhythm-week-show-resting') !== '0')
  const toggleResting = () => setShowResting(v => {
    localStorage.setItem('rhythm-week-show-resting', v ? '0' : '1')
    return !v
  })
  const restingCount = DAY_ORDER.reduce((n, d) => n + (restingDays?.[d].length ?? 0), 0)

  const total = DAY_ORDER.reduce((n, d) => n + days[d].length + (restingDays?.[d].length ?? 0), 0)
  if (total === 0 && sometime.length === 0 && dailyItems.length === 0 && !onQuickAdd) return null

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Through the week</h2>
        <div className="flex items-center gap-3">
          {restingCount > 0 && (
            <button
              onClick={toggleResting}
              className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {showResting ? 'Hide resting items' : `Show resting items (${restingCount})`}
            </button>
          )}
          {dailyItems.length > 0 && (
            <button
              onClick={toggleDaily}
              className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {showDaily ? 'Hide every-day items' : 'Show every-day items'}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(92px,1fr))] gap-2 overflow-x-auto min-w-0">
        {DAY_ORDER.map(day => {
          const items = days[day]
          const resting = showResting ? (restingDays?.[day] ?? []) : []
          const daily = showDaily ? dailyItems.filter(r => occursOn(r, day)) : []
          const isToday = day === todayKey
          return (
            <div
              key={day}
              data-testid={`day-${day}`}
              className={`rounded-xl p-2 ${
                isToday
                  ? 'border-2 border-[var(--color-primary-500,#3d5a44)] bg-emerald-50/40'
                  : 'border border-neutral-100 bg-white'
              }`}
            >
              <div className={`text-[10px] font-bold mb-1.5 ${isToday ? 'text-emerald-800' : 'text-neutral-400'}`}>
                {DAY_LABEL[day]}
                {isToday && ' · today'}
                {items.length >= FULL_THRESHOLD && <span className="text-orange-600"> · full</span>}
              </div>
              {items.length === 0 && daily.length === 0 && resting.length === 0 ? (
                <div className="text-[11px] italic text-neutral-300">quiet</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {items.map(r => (
                    <Chip key={`${day}-${r.id}`} r={r} stepCounts={stepCounts} matches={matches}
                          onOpen={onOpenRoutine} familyMembers={familyMembers}
                          steps={collectionSteps[r.id] ?? []} onAddStep={onAddStep} />
                  ))}
                </div>
              )}
              {resting.length > 0 && (
                <div className={`flex flex-col gap-1 ${items.length > 0 ? 'mt-1' : ''}`}>
                  {resting.map(r => (
                    <div
                      key={`${day}-resting-${r.id}`}
                      className="flex items-center gap-1 rounded-lg border border-dashed border-neutral-200 px-2 py-1.5"
                    >
                      <button
                        onClick={() => onOpenRoutine(r)}
                        className="flex-1 min-w-0 text-left text-xs text-neutral-400 hover:text-neutral-600"
                      >
                        <span className="line-clamp-2">{r.name}</span>
                        <span className="block text-[9px] uppercase tracking-wide text-neutral-300">asleep</span>
                      </button>
                      {onWake && (
                        <button
                          onClick={() => onWake(r)}
                          aria-label={`Wake ${r.name}`}
                          title="Wake — back to active"
                          className="flex-shrink-0 rounded-md p-1 text-neutral-300 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {daily.length > 0 && (
                <div className={items.length > 0 || resting.length > 0 ? 'mt-1.5 border-t border-neutral-100 pt-1.5' : ''}>
                  <div className="mb-1 text-[9px] uppercase tracking-wide text-neutral-300">every day</div>
                  <div className="flex flex-col gap-0.5">
                    {daily.map(r => (
                      <button
                        key={`${day}-daily-${r.id}`}
                        onClick={() => onOpenRoutine(r)}
                        className={`w-full rounded-md bg-neutral-50 px-1.5 py-1 text-left text-[10px] leading-snug
                                    text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors
                                    ${matches(r) ? '' : 'opacity-30'}`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {onQuickAdd && (
                <div className="mt-1">
                  <QuickAddInput
                    label={`Add a routine on ${DAY_LABEL[day]}`}
                    placeholder={`New on ${DAY_LABEL[day]}`}
                    onSubmit={name => onQuickAdd(name, day)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {sometime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-xs italic text-neutral-400">sometime this week —</span>
          {sometime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
