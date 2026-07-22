import { X } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { TendFinding } from './tendHeuristics'
import { TendCard } from './TendCard'
import { SeasonalShelf } from './SeasonalShelf'

export interface TendDrawerProps {
  open: boolean
  onClose: () => void
  findings: TendFinding[]
  routines: Routine[]
  /** model.seasonal — resting routines. */
  sleepers: Routine[]
  onDismiss: (key: string) => void
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}

export function TendDrawer(props: TendDrawerProps) {
  const { open, onClose, findings, routines, sleepers } = props
  if (!open) return null

  const empty = findings.length === 0 && sleepers.length === 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto bg-[var(--color-bg-base)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-neutral-800">Tend</h2>
          <button onClick={onClose} aria-label="Close tend drawer"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {empty && (
          <p className="py-10 text-center text-sm text-neutral-400">Nothing to tend — the rhythm is clean.</p>
        )}

        {findings.length > 0 && (
          <TendCard
            findings={findings}
            routines={routines}
            onMerge={props.onMerge}
            onStampDomain={props.onStampDomain}
            onRename={props.onRename}
            onLetGo={props.onLetGo}
            onDismiss={props.onDismiss}
          />
        )}

        {sleepers.length > 0 && (
          <SeasonalShelf routines={sleepers} onWakeAll={props.onWakeAll} onOpenRoutine={props.onOpenRoutine} />
        )}
      </div>
    </div>
  )
}
