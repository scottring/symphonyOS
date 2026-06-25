// src/components/surface/TapCollectionPanel.tsx
import { useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import type { Routine, RoutineWithSteps } from '@/types/actionable'
import type { TaskContext } from '@/types/task'
import type { RecurrencePattern } from '@/types/actionable'
import { PanelHeader } from './sections/PanelHeader'
import { PanelWhy } from './sections/PanelWhy'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { RoutineScheduleEditor } from '@/components/routine/RoutineScheduleEditor'
import { reorderByDrag } from '@/lib/today/stepOrdering'

interface TapCollectionPanelProps {
  collection: RoutineWithSteps
  onClose: () => void
  onRename: (name: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onScheduleChange: (pattern: RecurrencePattern, timeOfDay: string) => void
  onNotesChange: (next: string) => void
  onSelectStep: (step: Routine) => void
  onAddStep: (name: string) => void
  onReorderSteps: (writes: { id: string; step_order: number }[]) => void
}

function StepRow({ step, onSelect }: { step: Routine; onSelect: () => void }) {
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
      <button type="button" onClick={onSelect} className="flex-1 text-left text-sm text-neutral-800">
        {step.name}
        {dosed.length > 0 && <span className="ml-2 text-xs text-neutral-500">{dosed.join(', ')}</span>}
      </button>
    </div>
  )
}

export function TapCollectionPanel(props: TapCollectionPanelProps) {
  const { collection } = props
  const [draft, setDraft] = useState('')
  const [editingSchedule, setEditingSchedule] = useState(false)

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    props.onReorderSteps(reorderByDrag(collection.steps, String(e.active.id), String(e.over.id)))
  }

  const addStep = () => {
    const name = draft.trim()
    if (!name) return
    props.onAddStep(name)
    setDraft('')
  }

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader title={collection.name} onTitleChange={props.onRename} onClose={props.onClose} />

      <section className="pb-4 mb-4 border-b border-neutral-200 flex flex-col gap-3">
        <ContextPicker value={collection.context ?? undefined} onChange={props.onContextChange} />
        {editingSchedule ? (
          <div className="rounded-xl border border-neutral-200 p-3">
            <RoutineScheduleEditor
              size="sm"
              recurrencePattern={collection.recurrence_pattern}
              timeOfDay={(collection.time_of_day ?? '').slice(0, 5)}
              onChange={({ recurrencePattern, timeOfDay }) => props.onScheduleChange(recurrencePattern, timeOfDay)}
            />
            <button type="button" onClick={() => setEditingSchedule(false)} className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-700">Done</button>
          </div>
        ) : (
          <button onClick={() => setEditingSchedule(true)} className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-neutral-100 text-sm text-neutral-700 hover:bg-neutral-200">
            <span>Schedule</span><span className="text-xs text-neutral-500">Edit schedule</span>
          </button>
        )}
      </section>

      <section className="pb-4 mb-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Steps</h3>
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={collection.steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {collection.steps.map(s => (
                <StepRow key={s.id} step={s} onSelect={() => props.onSelectStep(s)} />
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
      </section>

      <PanelWhy key={collection.id} label="Notes" notes={collection.description ?? undefined} onChange={props.onNotesChange} />
    </article>
  )
}
