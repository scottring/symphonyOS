import type { TaskContext } from '@/types/task'
import type { Scope } from '@/lib/scope'
import type { FamilyMember } from '@/types/family'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { Lock, Users, Home } from 'lucide-react'

interface PanelClassifyProps {
  context: TaskContext | null | undefined
  onContextChange: (context: TaskContext | undefined) => void
  members: FamilyMember[]
  selectedAssigneeIds: string[]
  onAssigneesChange: (ids: string[]) => void
  /** Who can SEE the item (sharing ladder). When onScopeChange is omitted, the
   * scope control is hidden — so panels that don't manage scope are unaffected. */
  scope?: Scope
  onScopeChange?: (scope: Scope) => void
}

const SCOPE_OPTIONS: { value: Scope; label: string; Icon: typeof Lock }[] = [
  { value: 'individual', label: 'Just me', Icon: Lock },
  { value: 'couple', label: 'Us', Icon: Users },
  { value: 'compound', label: 'Everyone', Icon: Home },
]

export function PanelClassify(props: PanelClassifyProps) {
  const scope: Scope = props.scope ?? 'individual'
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
      {props.onScopeChange && (
        <div
          role="group"
          aria-label="Who can see this"
          className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200/70 p-0.5"
        >
          {SCOPE_OPTIONS.map(({ value, label, Icon }) => {
            const active = scope === value
            return (
              <button
                key={value}
                type="button"
                title={label}
                aria-pressed={active}
                onClick={() => props.onScopeChange!(value)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                  active ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
