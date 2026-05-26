import type { Routine, RoutineVisibility } from '@/types/routine'
import type { TaskContext } from '@/types/task'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelFooter } from './sections/PanelFooter'
import { ContextPicker } from '@/components/triage/ContextPicker'

function recurrenceSummary(r: Routine): string {
  const p = r.recurrence_pattern
  const time = r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ''
  if (p.type === 'weekly' && p.days?.length) return `Weekly · ${p.days.join(', ')}${time}`
  if (p.type === 'daily') return `Daily${time}`
  return `${p.type}${time}`
}

interface TapRoutinePanelProps {
  routine: Routine
  onClose: () => void
  onNotesChange: (next: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onVisibilityChange: (visibility: RoutineVisibility) => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine } = props
  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={routine.name}
        onTitleChange={() => { /* routine rename — out of scope */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow bucket={recurrenceSummary(routine)} />

      <section className="flex flex-wrap items-center gap-2 pb-4 mb-4 border-b border-neutral-200">
        <ContextPicker value={routine.context ?? undefined} onChange={props.onContextChange} />
        <div className="flex gap-1" role="group" aria-label="Visibility">
          {(['active', 'reference'] as RoutineVisibility[]).map((v) => (
            <button
              key={v}
              onClick={() => props.onVisibilityChange(v)}
              aria-label={v}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                routine.visibility === v ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <PanelWhy
        key={routine.id}
        label="Notes"
        notes={routine.description ?? undefined}
        onChange={props.onNotesChange}
      />

      <PanelFooter
        createdAt={new Date(routine.created_at)}
        updatedAt={new Date(routine.updated_at)}
      />
    </article>
  )
}
