// src/components/routine/board/RoutineBoard.tsx
//
// The bands of the Routines board — a masonry of small uppercase-labelled
// bands, each a stack of routine cards — and "Not showing" last: Resting and
// Off, folded, each opening in place.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { formatWake } from '@/lib/routines/explain'
import { RoutineCard } from './RoutineCard'
import type { BoardModel, BoardRoutine } from './boardModel'
import type { RoutineCommands } from './useRoutineCommands'

interface CardsProps {
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  today: Date
  commands: RoutineCommands
  canDelete: boolean
  onOpen: (r: Routine) => void
  onOpenStep: (step: Routine, parent: Routine) => void
  /** Drop one routine onto another's card to make it a step there. */
  onDropRoutine?: (draggedId: string, target: Routine) => void
}

function Cards({ items, ...p }: CardsProps & { items: BoardRoutine[] }) {
  return (
    <ul className="routine-band-cards">
      {items.map((item) => (
        <RoutineCard
          key={item.routine.id}
          item={item}
          familyMembers={p.familyMembers}
          dimmed={!p.matches(item.routine)}
          today={p.today}
          commands={p.commands}
          canDelete={p.canDelete}
          onOpen={p.onOpen}
          onOpenStep={(s) => p.onOpenStep(s, item.routine)}
          onDropRoutine={p.onDropRoutine ? (id) => p.onDropRoutine!(id, item.routine) : undefined}
        />
      ))}
    </ul>
  )
}

function Fold({ label, summary, items, cards }: { label: string; summary: string; items: BoardRoutine[]; cards: CardsProps }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <div className="routine-fold">
      <button type="button" className="routine-fold-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="routine-fold-label">{label} · {items.length}</span>
        {summary && <span className="routine-fold-summary"> — {summary}</span>}
        {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
      </button>
      {open && <Cards items={items} {...cards} />}
    </div>
  )
}

export function RoutineBoard({ model, ...cards }: CardsProps & { model: BoardModel }) {
  const firstWake = model.resting.find((i) => i.explanation.wakesOn)
  const restingSummary = firstWake
    ? `${firstWake.routine.name} wakes ${formatWake(firstWake.explanation.wakesOn!)}`
    : ''
  const notShowing = model.resting.length + model.off.length
  return (
    <div className="routine-board-bands">
      {model.bands.map((band) => (
        <section key={band.key} aria-label={band.label} className="routine-band">
          <h2 className="routine-band-label">{band.label}</h2>
          <Cards items={band.items} {...cards} />
        </section>
      ))}
      {notShowing > 0 && (
        <section aria-label="Not showing" className="routine-band routine-band-quiet">
          <h2 className="routine-band-label">Not showing</h2>
          <Fold label="Resting" summary={restingSummary} items={model.resting} cards={cards} />
          <Fold label="Off" summary="" items={model.off} cards={cards} />
        </section>
      )}
    </div>
  )
}
