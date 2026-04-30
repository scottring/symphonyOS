/** Five default habits — copy mirrors S2 / standing-habits language. */
export interface HabitDef {
  key: string
  label: string
}

export const DEFAULT_HABITS: HabitDef[] = [
  { key: 'yogurt_breakfast', label: 'Yogurt' },
  { key: 'dal_lunch',        label: 'Dal lunch' },
  { key: 'raw_veg',          label: 'Raw veg' },
  { key: 'snack',            label: 'Snack' },
  { key: 'light_dinner',     label: 'Light dinner' },
]
