// One card in the Daily Plan "To place" pile. The user reads it, sees what's
// already staged ("Bring"), and taps a slot ("When"). The AI line is advisory —
// it pre-suggests a slot but the tap is what commits.

import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'
import { MaterialChip } from '@/components/surface/MaterialChip'
import type { Material } from '@/types/material'
import type { TimeOfDay } from '@/lib/timeUtils'
import type { SlotSuggestion } from '@/lib/planning/suggestSlot'

export type ItemOrigin = 'carried_over' | 'email' | 'goal_nudge' | 'week' | 'routine'

const ORIGIN_META: Record<ItemOrigin, { icon: ConceptName; label: string; tone: string }> = {
  carried_over: { icon: 'time', label: 'Carried over', tone: 'bg-amber-50 text-amber-700' },
  email: { icon: 'email', label: 'From email', tone: 'bg-indigo-50 text-indigo-600' },
  goal_nudge: { icon: 'idea', label: 'Goal nudge', tone: 'bg-primary-50 text-primary-700' },
  week: { icon: 'when', label: 'This week', tone: 'bg-neutral-100 text-neutral-500' },
  routine: { icon: 'routine', label: 'Routine', tone: 'bg-primary-50 text-primary-700' },
}

const SLOTS: { slot: TimeOfDay; label: string }[] = [
  { slot: 'morning', label: 'Morning' },
  { slot: 'afternoon', label: 'Afternoon' },
  { slot: 'evening', label: 'Evening' },
]

interface PlanItemCardProps {
  title: string
  origin: ItemOrigin
  materials: Material[]
  suggestion: SlotSuggestion
  /** Currently chosen slot this session, if any (drives the selected toggle). */
  chosenSlot?: TimeOfDay
  onPickSlot: (slot: TimeOfDay) => void
  onNotToday: () => void
  onAddMaterial?: () => void
  onMaterialAction?: (m: Material) => void
}

export function PlanItemCard({
  title, origin, materials, suggestion, chosenSlot,
  onPickSlot, onNotToday, onAddMaterial, onMaterialAction,
}: PlanItemCardProps) {
  const om = ORIGIN_META[origin]
  const suggestedLabel = SLOTS.find((s) => s.slot === suggestion.slot)?.label ?? 'Morning'

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* Origin + title */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${om.tone}`}>
            <ConceptIcon name={om.icon} size={12} decorative /> {om.label}
          </span>
          <h3 className="mt-1.5 text-[15px] font-medium text-neutral-800 leading-snug">{title}</h3>
        </div>
      </div>

      {/* Bring — staged materials */}
      {(materials.length > 0 || onAddMaterial) && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">Bring</div>
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <MaterialChip key={m.id} material={m} onAction={onMaterialAction} />
            ))}
            {onAddMaterial && (
              <button
                type="button"
                onClick={onAddMaterial}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-400 hover:text-neutral-600 hover:border-neutral-400 transition-colors"
              >
                <ConceptIcon name="add" size={14} decorative /> Add
              </button>
            )}
          </div>
        </div>
      )}

      {/* When — slot toggles */}
      <div className="mt-3 pt-3 border-t border-neutral-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">When</span>
          <button
            type="button"
            onClick={onNotToday}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Not today
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {SLOTS.map(({ slot, label }) => {
            const selected = chosenSlot === slot
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onPickSlot(slot)}
                aria-pressed={selected}
                className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Advisory AI suggestion — only before a choice is made */}
      {!chosenSlot && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-700">
          <ConceptIcon name="ai" size={13} decorative />
          Symphony suggests {suggestedLabel} — {suggestion.reason}
        </p>
      )}
    </div>
  )
}
