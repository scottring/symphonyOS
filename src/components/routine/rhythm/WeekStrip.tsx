import { useMemo, useState } from 'react'
import { BarChart3, ChevronDown, LayoutList } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import type { DayKey } from './rhythmModel'
import { DAY_ORDER, resolveMembers } from './rhythmModel'
import { setDragPayload, acceptsDrag, readDragPayload } from './dragTypes'
import { resolveDrop, type DropIntent } from './dropRules'
import { orderedDayKeys, type WeekStart } from '@/lib/cadence/config'

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
  /** Drag-and-drop: chips become draggable and day columns accept drops. */
  onDropIntent?: (intent: DropIntent) => void
  /** Day focus: clicking a day's header selects it (the arc shows that day). */
  selectedDay?: DayKey | null
  onSelectDay?: (day: DayKey) => void
  /** Which day the week starts on (display order only — DAY_ORDER stays the
   *  model/storage order). Defaults to Sunday. */
  weekStartsOn?: WeekStart
}

const DAY_LABEL: Record<DayKey, string> = {
  sun: 'SUN', mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT',
}

const FULL_THRESHOLD = 4

function Chip({ r, stepCounts, matches, onOpen, familyMembers, steps, day, onDropIntent }: {
  r: Routine; stepCounts: Record<string, number>; matches: (r: Routine) => boolean; onOpen: (r: Routine) => void
  familyMembers: FamilyMember[]; steps: Routine[]; day?: DayKey; onDropIntent?: (intent: DropIntent) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const stepCount = stepCounts[r.id]
  const biweekly = r.recurrence_pattern.type === 'weekly' && r.recurrence_pattern.interval === 2
  const members = resolveMembers(r, familyMembers)
  return (
    <div
      draggable={!!onDropIntent}
      onDragStart={onDropIntent && day ? (e => setDragPayload(e, { kind: 'routine', id: r.id, fromDay: day })) : undefined}
      className={`w-full rounded-lg bg-emerald-50/60 px-2 py-1.5 text-xs text-neutral-700
                  transition-colors ${matches(r) ? '' : 'opacity-30'} ${onDropIntent ? 'cursor-grab' : ''}`}
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
        <ul className="mt-1.5 border-l-2 border-emerald-200 pl-2 flex flex-col gap-0.5">
          {steps.map(s => (
            <li key={s.id} className="text-[10px] leading-snug text-neutral-500">{s.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function WeekStrip({ days, sometime, stepCounts, matches, todayKey, onOpenRoutine, familyMembers = [], collectionSteps = {}, onDropIntent, selectedDay = null, onSelectDay, weekStartsOn = 0 }: WeekStripProps) {
  const [dropDay, setDropDay] = useState<DayKey | null>(null)
  // Pulse view: every chip renders as one slim uniform bar, so each column's
  // height reads as that day's load (one unit per routine; steps don't count).
  const [pulse, setPulse] = useState(() => localStorage.getItem('rhythm-week-density') === 'pulse')
  const togglePulse = () => setPulse(v => {
    localStorage.setItem('rhythm-week-density', v ? 'normal' : 'pulse')
    return !v
  })
  const orderedDays = useMemo(() => orderedDayKeys(weekStartsOn), [weekStartsOn])
  const total = DAY_ORDER.reduce((n, d) => n + days[d].length, 0)
  if (total === 0 && sometime.length === 0 && !onDropIntent) return null

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Through the week</h2>
        <button
          onClick={togglePulse}
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          {pulse ? <LayoutList className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
          {pulse ? 'Normal view' : 'Pulse view'}
        </button>
      </div>
      <div className={`grid grid-cols-[repeat(7,minmax(92px,1fr))] gap-2 overflow-x-auto min-w-0 ${pulse ? 'items-end' : ''}`}>
        {orderedDays.map(day => {
          const items = days[day]
          const isToday = day === todayKey
          const dropHandlers = onDropIntent ? {
            onDragOver: (e: React.DragEvent) => {
              if (!acceptsDrag(e, ['step', 'routine', 'collection', 'group'])) return
              e.preventDefault()
              setDropDay(day)
            },
            onDragLeave: () => setDropDay(null),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault()
              setDropDay(null)
              const payload = readDragPayload(e)
              if (!payload) return
              const intent = resolveDrop(payload, { kind: 'week-day', day })
              if (intent) onDropIntent(intent)
            },
          } : {}
          const borderClass =
            dropDay === day
              ? 'border-2 border-dashed border-amber-400 bg-amber-50/40'
              : selectedDay === day
                ? 'border-2 border-amber-500 bg-amber-50/40'
                : isToday
                  ? 'border-2 border-[var(--color-primary-500,#3d5a44)] bg-emerald-50/40'
                  : 'border border-neutral-100 bg-white'
          const dayLabel = (
            <>
              {DAY_LABEL[day]}
              {isToday && ' · today'}
              {items.length >= FULL_THRESHOLD && <span className="text-orange-600"> · full</span>}
            </>
          )
          const labelColor =
            selectedDay === day ? 'text-amber-700' : isToday ? 'text-emerald-800' : 'text-neutral-400 hover:text-neutral-600'

          // Pulse view: a true histogram — bars grow up from a shared bottom
          // baseline, one uniform unit per routine, day labels as the x-axis.
          if (pulse) {
            return (
              <div
                key={day}
                data-testid={`day-${day}`}
                {...dropHandlers}
                className={`flex flex-col justify-end rounded-xl p-2 ${borderClass}`}
              >
                {items.length > 0 && (
                  <span className="mb-1 text-center text-[10px] font-bold text-neutral-400">{items.length}</span>
                )}
                <div className="flex flex-col gap-0.5">
                  {items.map(r => (
                    <button
                      key={`${day}-${r.id}`}
                      title={r.name}
                      aria-label={r.name}
                      onClick={() => onOpenRoutine(r)}
                      draggable={!!onDropIntent}
                      onDragStart={onDropIntent ? (e => setDragPayload(e, { kind: 'routine', id: r.id, fromDay: day })) : undefined}
                      className={`h-2.5 w-full rounded-sm bg-emerald-400/70 hover:bg-emerald-500 transition-colors
                                  ${matches(r) ? '' : 'opacity-30'} ${onDropIntent ? 'cursor-grab' : ''}`}
                    />
                  ))}
                </div>
                {onSelectDay ? (
                  <button
                    onClick={() => onSelectDay(day)}
                    title={selectedDay === day ? 'Back to every day' : `Show ${DAY_LABEL[day]} on the timeline`}
                    className={`mt-1.5 block w-full text-center text-[10px] font-bold transition-colors ${labelColor}`}
                  >
                    {dayLabel}
                  </button>
                ) : (
                  <div className={`mt-1.5 text-center text-[10px] font-bold ${isToday ? 'text-emerald-800' : 'text-neutral-400'}`}>
                    {dayLabel}
                  </div>
                )}
              </div>
            )
          }

          return (
            <div
              key={day}
              data-testid={`day-${day}`}
              {...dropHandlers}
              className={`rounded-xl p-2 ${borderClass}`}
            >
              {onSelectDay ? (
                <button
                  onClick={() => onSelectDay(day)}
                  title={selectedDay === day ? 'Back to every day' : `Show ${DAY_LABEL[day]} on the timeline`}
                  className={`mb-1.5 block w-full text-left text-[10px] font-bold transition-colors ${labelColor}`}
                >
                  {dayLabel}
                </button>
              ) : (
                <div className={`text-[10px] font-bold mb-1.5 ${isToday ? 'text-emerald-800' : 'text-neutral-400'}`}>
                  {dayLabel}
                </div>
              )}
              {items.length === 0 ? (
                <div className="text-[11px] italic text-neutral-300">quiet</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {items.map(r => (
                    <Chip key={`${day}-${r.id}`} r={r} stepCounts={stepCounts} matches={matches}
                          onOpen={onOpenRoutine} familyMembers={familyMembers}
                          steps={collectionSteps[r.id] ?? []} day={day} onDropIntent={onDropIntent} />
                  ))}
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
