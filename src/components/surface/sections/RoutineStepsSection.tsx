// src/components/surface/sections/RoutineStepsSection.tsx
import { useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import { reorderByDrag } from '@/lib/today/stepOrdering'
import { ConceptIcon } from '@/lib/conceptIcons'
import { PanelSection } from './PanelSection'

export interface RoutineStepsSectionProps {
  steps: Routine[]
  onSelectStep: (step: Routine) => void
  onAddStep: (name: string) => void
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
  /** Today-completion per step id. Steps absent from the map (e.g. not scheduled
   *  today) render without a checkbox. When provided with onToggleStep, each
   *  step row becomes a checklist item. */
  checkedByStep?: Map<string, boolean>
  /** Toggle a step's completion for today (all doses at once). */
  onToggleStep?: (step: Routine) => void
}

function StepRow({
  step,
  onSelect,
  checked,
  onToggle,
}: {
  step: Routine
  onSelect: () => void
  /** undefined = no checkbox for this step */
  checked?: boolean
  onToggle?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const dosed = (step.times_per_day ?? []).map(t => t.slice(0, 5))
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-2"
    >
      <button type="button" aria-label={`Reorder ${step.name}`} className="text-neutral-400 cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      {checked !== undefined && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Mark ${step.name} ${checked ? 'not done' : 'done'} for today`}
          className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors
            ${checked ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300 text-transparent hover:border-primary-400'}`}
        >
          <ConceptIcon name="done" decorative size={10} />
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 text-left text-sm ${checked ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}
      >
        {step.name}
        {dosed.length > 0 && <span className="ml-2 text-xs text-neutral-500">{dosed.join(', ')}</span>}
      </button>
    </div>
  )
}

export function RoutineStepsSection({ steps, onSelectStep, onAddStep, onReorderSteps, checkedByStep, onToggleStep }: RoutineStepsSectionProps) {
  const [draft, setDraft] = useState('')

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    onReorderSteps(reorderByDrag(steps, String(e.active.id), String(e.over.id)))
  }

  const addStep = () => {
    const name = draft.trim()
    if (!name) return
    onAddStep(name)
    setDraft('')
  }

  return (
    <PanelSection
      id="routine-steps"
      label="Steps"
      preview={steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : undefined}
    >
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {steps.map(s => (
              <StepRow
                key={s.id}
                step={s}
                onSelect={() => onSelectStep(s)}
                checked={onToggleStep ? checkedByStep?.get(s.id) : undefined}
                onToggle={onToggleStep ? () => onToggleStep(s) : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 mt-3">
        <input
          aria-label="Add a step"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addStep() }}
          placeholder="New step name"
          className="input-base text-sm py-1 px-2 flex-1"
        />
        <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-900">
          <Plus className="w-4 h-4" /> Add step
        </button>
      </div>
    </PanelSection>
  )
}
