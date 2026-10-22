// Dev only: /kid-preview?scene=… — a kid's tablet with fixed days and a fixed
// clock, no reads or writes, for design review screenshots. Scenes:
// kaleb-tue, kaleb-sat, ella-mon, thoughts, timer, ring, done.

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildKidPanel } from '@/lib/kids/kidPanelModel'
import { startTimer, timerKey, writeTimer } from '@/lib/kids/kidTimer'
import type { KidRow, MemberDayModel } from '@/lib/wall/kidDayModel'
import type { KidThought } from '@/lib/kids/kidThoughts'
import { KidPanelView } from './KidPanelView'

const KALEB = { id: 'preview-kaleb', name: 'Kaleb', color: 'orange' }
const ELLA = { id: 'preview-ella', name: 'Ella', color: 'blue' }
const r = (id: string, title: string, time: string | null, done = false): KidRow => ({ entityType: 'routine', id, title, done, timeOfDay: time, target: null })
const empty: MemberDayModel = { needed: [], reading: null, school: null, homework: [], papers: [], notices: [], collections: [], bands: { morning: [], afternoon: [], evening: [], anytime: [] }, isEmpty: false }

function weekday(kind: 'reading' | 'math', allDone = false): MemberDayModel {
  return {
    ...empty,
    collections: [
      { id: 'home', title: 'Home from school', timeOfDay: '17:45', rows: [
        r('folder', 'Empty take-home folder', null, true),
        kind === 'reading' ? r('read', 'Reading, 20 minutes — a real book', null, allDone) : r('math', 'Math, 20–30 minutes (this week’s ClassDojo pages, half each day)', null, allDone),
      ] },
      { id: 'jax', title: 'Jax Evening Routine', timeOfDay: '18:00', rows: [r('jax', 'Feed Jax dinner', '18:00', allDone)] },
      { id: 'bed', title: 'Kids Bedtime routine', timeOfDay: '19:30', rows: [
        r('shower', 'Shower night: upstairs, teeth, undress, showers one after another', '19:30', allDone),
        r('own', 'Own reading or Yoto', '20:15', allDone), r('out', 'Lights out', '20:30', allDone),
      ] },
    ],
    bands: { morning: [], afternoon: [], evening: [r('puzzle', 'Puzzle Trail: 1 round', '18:45', allDone)], anytime: [r('tidy', 'Tidy bedrooms', null, allDone)] },
  }
}
const saturday: MemberDayModel = {
  ...empty,
  collections: [{ id: 'together', title: 'Tidy together: living room, kitchen, porch', timeOfDay: '07:30', rows: [r('lr', 'Living room', null, true), r('kit', 'Kitchen', null), r('porch', 'Porch', null)] }],
  bands: {
    morning: [r('outing', 'Family outing: walk, bike ride or hike, with breakfast', '08:00', true)],
    afternoon: [], evening: [r('puzzle', 'Puzzle Trail: 1 round', '18:45')],
    anytime: [r('tidy', 'Tidy bedrooms, 15 minutes', null), r('family', 'Family reading time every weekend', null)],
  },
}
const thoughts: KidThought[] = [
  { id: 't1', familyMemberId: KALEB.id, text: 'Can we go to the library on Saturday?', kind: 'ask', createdAt: new Date(2026, 9, 20, 16, 58), reviewedAt: null },
  { id: 't2', familyMemberId: KALEB.id, text: 'Build the Lego crane', kind: 'later', createdAt: new Date(2026, 9, 20, 17, 40), reviewedAt: null },
]

export default function KidKioskPreviewRoute() {
  const [q] = useSearchParams()
  const scene = q.get('scene') ?? 'kaleb-tue'
  const view = useMemo(() => {
    const tue = new Date(2026, 9, 20, 17, 52)
    if (scene === 'kaleb-sat') return { member: KALEB, layout: 'trail' as const, model: saturday, now: new Date(2026, 9, 24, 10, 5) }
    if (scene === 'ella-mon') return { member: ELLA, layout: 'list' as const, model: weekday('math'), now: new Date(2026, 9, 19, 17, 50) }
    if (scene === 'done') return { member: KALEB, layout: 'trail' as const, model: weekday('reading', true), now: new Date(2026, 9, 20, 20, 40) }
    return { member: KALEB, layout: 'trail' as const, model: weekday('reading'), now: tue }
  }, [scene])
  // A timer running on reading (6 minutes in), or one that has just rung.
  useMemo(() => {
    try {
      const at = view.now.getTime()
      const t = scene === 'ring' ? startTimer('Reading', 20, at - 20 * 60_000, 'routine:read')
        : scene === 'ella-mon' ? startTimer('Math', 20, at - 80_000, 'routine:math')
          : scene === 'kaleb-tue' || scene === 'thoughts' || scene === 'timer' ? startTimer('Reading', 20, at - 6 * 60_000, 'routine:read') : null
      writeTimer(localStorage, timerKey(view.member.id), t)
    } catch { /* no storage */ }
  }, [scene, view])
  const panel = buildKidPanel(view.model, view.member.id, view.now)
  return (
    <KidPanelView
      key={scene}
      member={view.member}
      layout={view.layout}
      panel={panel}
      now={view.now}
      onToggle={() => undefined}
      thoughts={scene === 'ella-mon' ? [] : thoughts}
      onSaveThought={async () => true}
      canListen={scene === 'thoughts'}
      initialSheet={scene === 'thoughts' ? 'thoughts' : scene === 'timer' ? 'timer' : null}
    />
  )
}
