import type { MealParameter } from '@/types/meal-planner'

interface Props {
  value?: MealParameter
  onChange: (parameter: MealParameter | undefined) => void
}

const PRESETS: Array<{ id: MealParameter; label: string }> = [
  { id: 'regular',   label: 'Regular' },
  { id: '800g',      label: '800g challenge' },
  { id: 'low-carb',  label: 'Low-carb' },
  { id: 'custom',    label: 'Custom' },
]

export function ParameterDropdown({ value, onChange }: Props) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? (e.target.value as MealParameter) : undefined)}
      className="px-4 py-1.5 rounded-full text-[13px] font-medium bg-bg-elevated border border-neutral-200 text-neutral-700"
    >
      <option value="">Standard week</option>
      {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  )
}
