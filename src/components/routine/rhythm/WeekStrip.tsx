import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import type { DayKey } from './rhythmModel'
import { DAY_ORDER, resolveMembers } from './rhythmModel'

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
}

const DAY_LABEL: Record<DayKey, string> = {
  sun: 'SUN', mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT',
}

const FULL_THRESHOLD = 4

function Chip({ r, stepCounts, matches, onOpen, familyMembers, steps }: {
  r: Routine; stepCounts: Record<string, number>; matches: (r: Routine) => boolean; onOpen: (r: Routine) => void
  familyMembers: FamilyMember[]; steps: Routine[]
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
        <ul className="mt-1.5 border-l-2 border-emerald-200 pl-2 flex flex-col gap-0.5">
          {steps.map(s => (
            <li key={s.id} className="text-[10px] leading-snug text-neutral-500">{s.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function WeekStrip({ days, sometime, stepCounts, matches, todayKey, onOpenRoutine, familyMembers = [], collectionSteps = {} }: WeekStripProps) {
  const total = DAY_ORDER.reduce((n, d) => n + days[d].length, 0)
  if (total === 0 && sometime.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Through the week</h2>
      <div className="grid grid-cols-[repeat(7,minmax(92px,1fr))] gap-2 overflow-x-auto min-w-0">
        {DAY_ORDER.map(day => {
          const items = days[day]
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
              {items.length === 0 ? (
                <div className="text-[11px] italic text-neutral-300">quiet</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {items.map(r => (
                    <Chip key={`${day}-${r.id}`} r={r} stepCounts={stepCounts} matches={matches}
                          onOpen={onOpenRoutine} familyMembers={familyMembers}
                          steps={collectionSteps[r.id] ?? []} />
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
