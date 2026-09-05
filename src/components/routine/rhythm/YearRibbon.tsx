import { useState } from 'react'
import { BarChart3, LayoutList, Sunrise } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { resolveMembers } from './rhythmModel'
import type { YearEntry, YearMonth, YearModel } from './yearModel'
import { setDragPayload, acceptsDrag, readDragPayload } from './dragTypes'
import { resolveDrop, type DropIntent } from './dropRules'

export interface YearRibbonProps {
  model: YearModel
  matches: (r: Routine) => boolean
  onOpenRoutine: (r: Routine) => void
  stepCounts?: Record<string, number>
  familyMembers?: FamilyMember[]
  /** Wake a resting routine now, rather than waiting for its month. */
  onWake?: (id: string) => void
  /** Drag-and-drop: chips become draggable and month rows accept drops. */
  onDropIntent?: (intent: DropIntent) => void
}

const FULL_THRESHOLD = 3

/** The month a chip currently sits in — a resting chip dropped back on its own
 *  month is a no-op, the way a week chip is on its own day. */
function dragPayloadFor(entry: YearEntry, month: number) {
  return entry.resting
    ? { kind: 'routine' as const, id: entry.routine.id, resting: true, fromMonth: month }
    : { kind: 'routine' as const, id: entry.routine.id }
}

function Chip({ entry, month, matches, onOpen, onWake, stepCounts, familyMembers, onDropIntent }: {
  entry: YearEntry
  month: number
  matches: (r: Routine) => boolean
  onOpen: (r: Routine) => void
  onWake?: (id: string) => void
  stepCounts: Record<string, number>
  familyMembers: FamilyMember[]
  onDropIntent?: (intent: DropIntent) => void
}) {
  const r = entry.routine
  const members = resolveMembers(r, familyMembers)
  const stepCount = stepCounts[r.id]
  const tone = entry.resting
    ? 'bg-amber-50/70 text-amber-900'
    : 'bg-emerald-50/60 text-neutral-700'

  return (
    <div
      draggable={!!onDropIntent}
      onDragStart={onDropIntent ? (e => setDragPayload(e, dragPayloadFor(entry, month))) : undefined}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors
                  ${tone} ${matches(r) ? '' : 'opacity-30'} ${onDropIntent ? 'cursor-grab' : ''}`}
    >
      <button onClick={() => onOpen(r)} className="min-w-0 text-left hover:underline">
        {/* A drifting routine's month is an estimate — the tilde says so without
            a second line of chrome. */}
        {entry.drifting ? '~' : ''}{r.name}
      </button>
      {stepCount ? <span className="text-[10px] text-neutral-400">{stepCount} steps</span> : null}
      {members.length > 0 && (
        <span className="flex -space-x-1.5">
          {members.map(m => (
            <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
          ))}
        </span>
      )}
      {entry.resting && onWake && (
        <button
          onClick={() => onWake(r.id)}
          aria-label={`Wake ${r.name}`}
          title={`Wake ${r.name} now`}
          className="flex-shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-100 hover:text-amber-800 transition-colors"
        >
          <Sunrise className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

export function YearRibbon({
  model, matches, onOpenRoutine, stepCounts = {}, familyMembers = [], onWake, onDropIntent,
}: YearRibbonProps) {
  const [dropCell, setDropCell] = useState<string | null>(null)
  // Pulse view: one uniform bar per routine, so a row's length reads as that
  // month's load. Horizontal here because the ribbon stacks months as rows.
  const [pulse, setPulse] = useState(() => localStorage.getItem('rhythm-year-density') === 'pulse')
  const togglePulse = () => setPulse(v => {
    localStorage.setItem('rhythm-year-density', v ? 'normal' : 'pulse')
    return !v
  })

  const dropHandlersFor = (cell: YearMonth) => {
    if (!onDropIntent) return {}
    const key = `${cell.year}-${cell.month}`
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!acceptsDrag(e, ['step', 'routine', 'collection', 'group'])) return
        e.preventDefault()
        setDropCell(key)
      },
      onDragLeave: () => setDropCell(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        setDropCell(null)
        const payload = readDragPayload(e)
        if (!payload) return
        const intent = resolveDrop(payload, { kind: 'year-month', month: cell.month, year: cell.year })
        if (intent) onDropIntent(intent)
      },
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Through the year</h2>
        <button
          onClick={togglePulse}
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          {pulse ? <LayoutList className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
          {pulse ? 'Normal view' : 'Pulse view'}
        </button>
      </div>

      {model.everyMonth.length > 0 && (
        <div
          data-testid="every-month"
          className="mb-3 rounded-xl border border-neutral-100 bg-white p-3"
        >
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Every month
          </div>
          <div className="flex flex-wrap gap-1.5">
            {model.everyMonth.map(r => (
              <button
                key={r.id}
                onClick={() => onOpenRoutine(r)}
                draggable={!!onDropIntent}
                onDragStart={onDropIntent ? (e => setDragPayload(e, { kind: 'routine', id: r.id })) : undefined}
                className={`rounded-full bg-emerald-50/60 px-3 py-1 text-xs text-neutral-700
                            hover:bg-emerald-100 transition-colors ${matches(r) ? '' : 'opacity-30'}
                            ${onDropIntent ? 'cursor-grab' : ''}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {model.months.map(cell => {
          const key = `${cell.year}-${cell.month}`
          const borderClass =
            dropCell === key
              ? 'border-2 border-dashed border-amber-400 bg-amber-50/40'
              : cell.isCurrent
                ? 'border-2 border-[var(--color-primary-500,#3d5a44)] bg-emerald-50/40'
                : 'border border-neutral-100 bg-white'

          return (
            <div
              key={key}
              data-testid={`year-month-${key}`}
              {...dropHandlersFor(cell)}
              className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${borderClass}`}
            >
              <div
                className={`w-24 flex-shrink-0 text-[10px] font-bold
                            ${cell.isCurrent ? 'text-emerald-800' : 'text-neutral-400'}`}
              >
                {cell.label}
                {cell.isCurrent && ' · now'}
                {cell.entries.length >= FULL_THRESHOLD && <span className="text-orange-600"> · full</span>}
              </div>

              {cell.entries.length === 0 ? (
                pulse ? <div className="h-2.5" /> : <div className="text-[11px] italic text-neutral-300">quiet</div>
              ) : pulse ? (
                <div className="flex flex-1 items-center gap-0.5">
                  {cell.entries.map(entry => (
                    <button
                      key={entry.routine.id}
                      title={entry.routine.name}
                      aria-label={entry.routine.name}
                      onClick={() => onOpenRoutine(entry.routine)}
                      draggable={!!onDropIntent}
                      onDragStart={onDropIntent ? (e => setDragPayload(e, dragPayloadFor(entry, cell.month))) : undefined}
                      className={`h-2.5 w-8 rounded-sm transition-colors
                                  ${entry.resting ? 'bg-amber-300/80 hover:bg-amber-400' : 'bg-emerald-400/70 hover:bg-emerald-500'}
                                  ${matches(entry.routine) ? '' : 'opacity-30'}
                                  ${onDropIntent ? 'cursor-grab' : ''}`}
                    />
                  ))}
                  <span className="ml-1 text-[10px] font-bold text-neutral-400">{cell.entries.length}</span>
                </div>
              ) : (
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {cell.entries.map(entry => (
                    <Chip
                      key={entry.routine.id}
                      entry={entry}
                      month={cell.month}
                      matches={matches}
                      onOpen={onOpenRoutine}
                      onWake={onWake}
                      stepCounts={stepCounts}
                      familyMembers={familyMembers}
                      onDropIntent={onDropIntent}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
