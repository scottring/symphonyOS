// src/components/plan/v2/WeekMenu.tsx
//
// The Week header's ⋯: its four view choices (useWeekViewPrefs, remembered on
// this device) in the shared PageMenu.

import { useWeekViewPrefs, type WeekViewPref } from '@/hooks/useWeekViewPrefs'
import { PageMenu } from '@/components/plan/PageMenu'

const CHOICES: { pref: WeekViewPref; label: string; hint?: string }[] = [
  { pref: 'freeTime', label: 'Show free time', hint: '“Calendar clear” under each day' },
  { pref: 'weather', label: 'Show weather' },
  { pref: 'done', label: 'Show done' },
  { pref: 'dailyInDays', label: 'Show daily routines in each day' },
]

export function WeekMenu({ talk }: { talk?: () => void } = {}) {
  const prefs = useWeekViewPrefs()
  return (
    <PageMenu label="Week options" talk={talk}
      choices={CHOICES.map((c) => ({ id: c.pref, label: c.label, hint: c.hint, checked: prefs[c.pref], onSelect: () => prefs.set(c.pref, !prefs[c.pref]) }))} />
  )
}
