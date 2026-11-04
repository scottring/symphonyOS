// A period's energy note (`notes.energy`: { level, words? }), as the Energy
// step asks it in its tooltip and the header line's menu changes it
// (planning as tooltips, Task 4, 2026-11-04). Words already said with it are
// kept whatever the level becomes; clearing removes only the level.

import type { GuideNotes } from '@/hooks/usePlanningNotes'

export type EnergyNote = NonNullable<GuideNotes['energy']>
export type EnergyLevel = NonNullable<EnergyNote['level']>

export const ENERGY_CHOICES: readonly { value: EnergyLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const isEnergyLevel = (v: string): v is EnergyLevel => ENERGY_CHOICES.some((c) => c.value === v)

/** The note with this level (null: cleared), keeping any words. Nothing
 *  left: undefined, so the note goes. */
export function withEnergy(current: GuideNotes['energy'], level: EnergyLevel | null): EnergyNote | undefined {
  const words = current?.words
  if (level === null) return words ? { words } : undefined
  return words ? { level, words } : { level }
}
