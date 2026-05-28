import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'

interface PanelClassifyProps {
  context: TaskContext | null | undefined
  onContextChange: (context: TaskContext | undefined) => void
  members: FamilyMember[]
  selectedAssigneeIds: string[]
  onAssigneesChange: (ids: string[]) => void
}

export function PanelClassify(props: PanelClassifyProps) {
  return (
    <section className="flex flex-wrap items-center gap-2">
      <ContextPicker
        value={props.context ?? undefined}
        onChange={props.onContextChange}
      />
      <MultiAssigneeDropdown
        members={props.members}
        selectedIds={props.selectedAssigneeIds}
        onSelect={props.onAssigneesChange}
      />
    </section>
  )
}
