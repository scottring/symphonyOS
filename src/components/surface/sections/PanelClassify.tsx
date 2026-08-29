import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'

// There is deliberately NO scope control here. Scope (who can SEE the item) is
// DERIVED from these two answers — the domain and the assignees — by
// scopeForDomain (src/lib/scope.ts). A picker beside them could only disagree
// with them, which is the state the August leak lived in: a row whose life area
// said private and whose scope still said compound.
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
