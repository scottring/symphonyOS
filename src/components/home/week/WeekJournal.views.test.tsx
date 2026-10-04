import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekJournal, type JournalDay } from './WeekJournal'
import type { FamilyMember } from '@/types/family'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const week = (): JournalDay[] => Array.from({ length: 7 }, (_, i) => {
  const date = new Date(2026, 9, 3 + i)
  return { date, key: ymd(date), notes: [], entries: [], foldedRoutines: [], available: [], dinners: [] }
})
const members = [
  { id: 'sk', name: 'Scott', initials: 'SK', color: 'blue' },
  { id: 'ir', name: 'Iris', initials: 'IR', color: 'purple' },
] as FamilyMember[]
const fill = () => {
  const days = week()
  const mon = days[2]
  mon.entries = [
    { id: 'task-jury', kind: 'task', time: new Date(2026, 9, 5, 8), end: new Date(2026, 9, 5, 17), title: 'Jury duty', completed: false, people: ['sk'] },
    { id: 'event-e', kind: 'event', time: new Date(2026, 9, 5, 19), title: 'Bedtime', completed: false },
    { id: 'task-gift', kind: 'task', title: 'Gift shopping', completed: false, people: ['ir'] },
  ]
  mon.foldedRoutines = [{ id: 'routine-r-day2', kind: 'routine', title: 'Pack lunches', completed: false, routineId: 'r', people: ['ir'] }]
  return days
}
const renderView = (props: Partial<Parameters<typeof WeekJournal>[0]>) => render(
  <DndContext><WeekJournal days={fill()} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} members={members} {...props} /></DndContext>,
)

// Scott, 2026-10-03: planning in steps — the week beside each step, and the
// finished week's shape: what's taken, what's free, who carries what.
describe('WeekJournal — the strip beside a step', () => {
  it('seven compact days, each with its things and its free time', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 9))
    renderView({ variant: 'strip' })
    vi.useRealTimers()
    const days = screen.getAllByTestId(/^strip-day-/)
    expect(days).toHaveLength(7)
    const mon = within(screen.getByTestId('strip-day-2026-10-05'))
    expect(mon.getByText('Jury duty')).toBeInTheDocument()
    expect(mon.getByText(/^Free /)).toBeInTheDocument()
  })

  // Scott, 2026-10-04: "the week so far is basically unreadable … no
  // hierarchy, same font for everything". The strip follows the page's rules.
  it('reads like the Week page: kinds marked, time apart, no counts, no daily routines', () => {
    const days = fill()
    days.forEach((d) => d.entries.push({ id: `routine-jax-${d.key}`, kind: 'routine', title: 'Walk Jax', completed: false, routineId: 'jax', time: new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 18) }))
    render(<DndContext><WeekJournal variant="strip" days={days} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} members={members} /></DndContext>)
    const mon = within(screen.getByTestId('strip-day-2026-10-05'))
    expect(screen.queryByText('Walk Jax')).toBeNull()
    expect(mon.queryByText(/routines?$/)).toBeNull()
    expect(mon.getByText('Pack lunches')).toBeInTheDocument()
    expect(mon.getByText('Bedtime').closest('li')?.dataset.mark).toBe('event')
    expect(mon.getByText('Pack lunches').closest('li')?.dataset.mark).toBe('routine')
    expect(mon.getByText('Gift shopping').closest('li')?.dataset.mark).toBe('task')
    expect(mon.getByText('7p')).toHaveClass('wk-strip-time')
  })
})

describe('WeekJournal — the shape of the week', () => {
  it('shows each day’s free time and who carries each thing', () => {
    renderView({ variant: 'shape' })
    const mon = within(screen.getByTestId('shape-day-2026-10-05'))
    expect(mon.getByText('Free 7–8a · 5–7p · 7:30–9p')).toBeInTheDocument()
    expect(mon.getByText('Pack lunches')).toBeInTheDocument()
    expect(mon.getAllByText('IR').length).toBeGreaterThan(0)
  })
  it('one person’s week: others’ things fade, and free time is theirs', () => {
    renderView({ variant: 'shape', person: 'ir' })
    const mon = within(screen.getByTestId('shape-day-2026-10-05'))
    expect(mon.getByText('Jury duty').closest('li')).toHaveClass('is-dim')
    expect(mon.getByText('Gift shopping').closest('li')).not.toHaveClass('is-dim')
    // Iris has no jury duty: only the shared bedtime is taken.
    expect(mon.getByText('Free 7a–7p · 7:30–9p')).toBeInTheDocument()
  })
})
