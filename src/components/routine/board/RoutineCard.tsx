// src/components/routine/board/RoutineCard.tsx
//
// One routine on the board: its name once (the header opens it), a meta line
// (people · days · time), where it shows, then its Steps. Secondary verbs live
// in the visible ⋯ menu: Edit, Hide for today, Rest until…, Off, Delete.

import { useState, type DragEvent } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { useArrived } from '@/contexts/CanvasActivityContext'
import { ROUTINE_HIDE_LABELS, clockText } from '@/lib/routines/explain'
import { ShowsOnChips } from '../WhereItShows'
import { metaLine, ROUTINE_DRAG_TYPE, type BoardRoutine } from './boardModel'
import type { RoutineCommands } from './useRoutineCommands'

export function RoutineCard({ item, familyMembers, dimmed = false, today, commands, canDelete, onOpen, onOpenStep, onDropRoutine }: {
  item: BoardRoutine
  familyMembers: FamilyMember[]
  dimmed?: boolean
  /** The day "Hide for today" is about. */
  today: Date
  commands: RoutineCommands
  canDelete: boolean
  onOpen: (r: Routine) => void
  onOpenStep: (step: Routine) => void
  /** A routine dragged onto this card (drag-to-group). Absent = no drop. */
  onDropRoutine?: (draggedId: string) => void
}) {
  const { routine, steps, explanation } = item
  const arrived = useArrived(routine.id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [resting, setResting] = useState(false)
  const [restDate, setRestDate] = useState('')
  const [dropOver, setDropOver] = useState(false)
  const close = () => { setMenuOpen(false); setResting(false); setRestDate('') }

  // A single routine can be folded into another; a collection can't nest.
  const draggable = !!onDropRoutine && steps.length === 0
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(ROUTINE_DRAG_TYPE, routine.id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const accepts = (e: DragEvent) => !!onDropRoutine && Array.from(e.dataTransfer.types).includes(ROUTINE_DRAG_TYPE)

  const skipped = explanation.today.rung === 'skipped'
  const canHideToday = explanation.today.shows
  const isResting = explanation.state === 'resting'
  const isOff = explanation.state === 'off'

  const menuItem = (label: string, onClick: () => void, opts: { hint?: string; disabled?: boolean; danger?: boolean } = {}) => (
    <button
      type="button"
      role="menuitem"
      disabled={opts.disabled}
      onClick={() => { onClick() }}
      className={`routine-menu-item${opts.danger ? ' is-danger' : ''}`}
    >
      <span>{label}</span>
      {opts.hint && <span className="routine-hide-option-hint">{opts.hint}</span>}
    </button>
  )

  return (
    <li
      data-routine-id={routine.id}
      className={`canvas-group routine-card${dimmed ? ' is-dimmed' : ''}${arrived ? ' canvas-arrived' : ''}${dropOver ? ' is-drop-target' : ''}`}
      draggable={draggable || undefined}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setDropOver(true) } }}
      onDragLeave={() => setDropOver(false)}
      onDrop={(e) => {
        setDropOver(false)
        const id = e.dataTransfer.getData(ROUTINE_DRAG_TYPE)
        if (id && id !== routine.id && onDropRoutine) { e.preventDefault(); onDropRoutine(id) }
      }}
    >
      <div className="canvas-group-head routine-card-head">
        <button type="button" className="canvas-group-title routine-card-title" onClick={() => onOpen(routine)}>
          {routine.name}
        </button>
        <div className="routine-menu-anchor">
          <button
            type="button"
            className="canvas-icon routine-card-more"
            aria-label={`Options for ${routine.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={close} />
              <div role="menu" aria-label={`${routine.name} options`} className="routine-menu">
                {menuItem('Edit', () => { close(); onOpen(routine) })}
                {!isResting && !isOff && (skipped
                  ? menuItem('Show today again', () => { close(); void commands.showToday(routine.id, routine.name, today) }, { hint: 'Undo Hide for today' })
                  : menuItem(ROUTINE_HIDE_LABELS.today, () => { close(); void commands.hideForToday(routine.id, routine.name, today) }, {
                    hint: canHideToday ? 'Skips today only — back next time' : 'Not on Today today',
                    disabled: !canHideToday,
                  }))}
                {isResting
                  ? menuItem('Wake now', () => { close(); void commands.wake(routine) }, { hint: explanation.today.reason })
                  : resting
                    ? (
                      <div className="routine-menu-rest">
                        <input
                          type="date"
                          aria-label="Rest until"
                          value={restDate}
                          onChange={(e) => setRestDate(e.target.value)}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
                        />
                        <button type="button" className="canvas-chip" onClick={() => { const d = restDate || null; close(); void commands.rest(routine, d) }}>
                          {restDate ? 'Rest' : 'Rest, no date'}
                        </button>
                      </div>
                    )
                    : menuItem(ROUTINE_HIDE_LABELS.rest, () => setResting(true), { hint: 'Asleep everywhere until a date' })}
                {!isResting && (isOff
                  ? menuItem('Show in Today and planning', () => { close(); void commands.setOff(routine, false) }, { hint: 'It is Off now' })
                  : menuItem(ROUTINE_HIDE_LABELS.off, () => { close(); void commands.setOff(routine, true) }, { hint: 'Hidden from Today and planning' }))}
                {canDelete && menuItem('Delete', () => { close(); void commands.remove(routine) }, { danger: true })}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="routine-card-meta">{metaLine(routine, familyMembers)}</p>
      <ShowsOnChips routine={routine} explanation={explanation} onOpen={onOpen} />

      {steps.length > 0 && (
        <div className="routine-card-steps">
          {steps.map((s) => (
            <button key={s.id} type="button" className="canvas-item routine-step" onClick={() => onOpenStep(s)}>
              <span className="routine-step-dot" aria-hidden="true" />
              <span className="canvas-item-title">{s.name}</span>
              {clockText(s.time_of_day) && <span className="canvas-item-meta">{clockText(s.time_of_day)}</span>}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
