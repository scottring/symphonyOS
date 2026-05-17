export type RhythmMode = 'morning' | 'day' | 'after-school' | 'dinner' | 'bedtime' | 'wind-down'

export const RHYTHM_MODES: RhythmMode[] = [
  'morning', 'day', 'after-school', 'dinner', 'bedtime', 'wind-down',
]

export const RHYTHM_MODE_LABELS: Record<RhythmMode, { label: string; window: string }> = {
  morning: { label: 'Morning', window: '6–9a' },
  day: { label: 'Day', window: '9a–3p' },
  'after-school': { label: 'After school', window: '3–5p' },
  dinner: { label: 'Dinner', window: '5–7p' },
  bedtime: { label: 'Bedtime', window: '7–9p' },
  'wind-down': { label: 'Wind down', window: '9p+' },
}

export function rhythmModeForClock(now: Date): RhythmMode {
  const hour = now.getHours()
  if (hour >= 6 && hour < 9) return 'morning'
  if (hour >= 9 && hour < 15) return 'day'
  if (hour >= 15 && hour < 17) return 'after-school'
  if (hour >= 17 && hour < 19) return 'dinner'
  if (hour >= 19 && hour < 21) return 'bedtime'
  return 'wind-down'
}
