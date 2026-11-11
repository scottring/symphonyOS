// src/components/plan/v2/WeekMenu.tsx
//
// The Week header's ⋯: what isn't due (planning again — WeekV2's), then its
// view choices (useWeekViewPrefs, remembered on this device) in the shared
// PageMenu. List | Grid moved in here from the header (Week as an open
// journal, 2026-11-11): the list is the Week; the grid is a way of looking,
// one tick away. While the week is being planned it steps aside (planning
// always uses the list). `note` is the quiet "Planned Wed · Last week's
// review" line, kept at the menu's foot rather than under the dates.

import type { ReactNode } from 'react'
import { useWeekLayout, useWeekViewPrefs, type WeekViewPref } from '@/hooks/useWeekViewPrefs'
import { PageMenu, type PageMenuChoice } from '@/components/plan/PageMenu'

const CHOICES: { pref: WeekViewPref; label: string; hint?: string }[] = [
  { pref: 'freeTime', label: 'Show free time', hint: '“Calendar clear” under each day' },
  { pref: 'weather', label: 'Show weather' },
  { pref: 'done', label: 'Show done' },
  { pref: 'dailyInDays', label: 'Show daily routines in each day' },
]

export function WeekMenu({ offers = [], layout = false, note }: { offers?: PageMenuChoice[]; layout?: boolean; note?: ReactNode } = {}) {
  const prefs = useWeekViewPrefs()
  const [shape, setShape] = useWeekLayout()
  const grid: PageMenuChoice[] = layout
    ? [{ id: 'grid', label: 'Show the days as a grid', checked: shape === 'grid', onSelect: () => setShape(shape === 'grid' ? 'list' : 'grid') }]
    : []
  return (
    <PageMenu label="Week options" note={note}
      choices={[...offers, ...grid, ...CHOICES.map((c) => ({ id: c.pref, label: c.label, hint: c.hint, checked: prefs[c.pref], onSelect: () => prefs.set(c.pref, !prefs[c.pref]) }))]} />
  )
}
