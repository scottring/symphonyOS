import { Link2Off } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import { PanelHeader } from './sections/PanelHeader'
import { PanelWhy } from './sections/PanelWhy'
import { DosePills } from './sections/DosePills'

interface TapStepPanelProps {
  step: Routine
  parentName: string
  onClose: () => void
  onRename: (name: string) => void
  onDosesChange: (times: string[]) => void
  onNotesChange: (next: string) => void
  onPromote: () => void
}

export function TapStepPanel(props: TapStepPanelProps) {
  const { step, parentName } = props
  const times = (step.times_per_day ?? []).map(t => t.slice(0, 5))

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader title={step.name} onTitleChange={props.onRename} onClose={props.onClose} />

      <p className="text-xs text-neutral-500 mb-4">
        Context, people and schedule are <span className="font-medium">inherited from {parentName}</span>.
      </p>

      <section className="pb-4 mb-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Dose times</h3>
        <DosePills times={times} onChange={props.onDosesChange} />
      </section>

      <PanelWhy key={step.id} label="Instructions" notes={step.description ?? undefined} onChange={props.onNotesChange} />

      <button
        type="button"
        onClick={props.onPromote}
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-red-600"
      >
        <Link2Off className="w-4 h-4" /> Remove from collection
      </button>
    </article>
  )
}
