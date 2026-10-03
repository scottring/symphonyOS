import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekJournal, type JournalDay, type JournalEntry } from './WeekJournal'
import { createMockTask } from '@/test/mocks/factories'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const week = (): JournalDay[] => Array.from({ length: 7 }, (_, i) => {
  const date = new Date(2026, 9, 3 + i)
  return { date, key: ymd(date), notes: [], entries: [], foldedRoutines: [], available: [], dinners: [] }
})
const task = createMockTask({ id: 't1', title: 'Buy a helmet', scheduledFor: new Date(2026, 9, 5), isAllDay: true })
const fill = () => {
  const days = week()
  const mon = days[2]
  mon.entries = [
    { id: 'event-e1', kind: 'event', time: new Date(2026, 9, 5, 9), title: 'Boxing', completed: false },
    { id: 'task-t1', kind: 'task', title: 'Buy a helmet', completed: false, task } as JournalEntry,
  ]
  mon.foldedRoutines = [{ id: 'routine-r1-day2', kind: 'routine', title: 'Pack lunches', completed: false, routineId: 'r1' }]
  return days
}
const renderDays = (props: Partial<Parameters<typeof WeekJournal>[0]>) => render(
  <DndContext><WeekJournal layout="grid" days={fill()} weekend={{ satIndex: 0, sunIndex: 1, sometime: [{ id: 'routine-w-day0', kind: 'routine', title: 'Yard weeding', completed: false, routineId: 'w' }] }}
    spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} onAddToDay={vi.fn()} timingControl={() => <span>when</span>} {...props} /></DndContext>,
)

// Scott, 2026-10-03: planning in steps — the days show what each step needs.
describe('WeekJournal — what each planning step shows', () => {
  it('Fixed points: only what can’t move; an empty day still shows its date and + Add', () => {
    renderDays({ show: 'fixed' })
    const mon = within(screen.getByTestId('journal-day-2026-10-05'))
    expect(mon.getByText('Boxing')).toBeInTheDocument()
    expect(mon.queryByText('Buy a helmet')).toBeNull()
    expect(mon.queryByRole('button', { name: /Routines ·/ })).toBeNull()
    expect(screen.queryByTestId('weekend-sometime')).toBeNull()
    const tue = within(screen.getByTestId('journal-day-2026-10-06'))
    expect(tue.getByRole('button', { name: 'Add to Tuesday' })).toBeInTheDocument()
  })
  it('Fill the week: each day’s routines are open', () => {
    renderDays({ routinesOpen: true })
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Pack lunches')).toBeInTheDocument()
  })
  it('The plan: read-only — nothing moves, no + Add, no timing control', () => {
    const { container } = renderDays({ readOnly: true })
    expect(container.querySelector('[data-movable="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Add to / })).toBeNull()
    expect(screen.queryByText('when')).toBeNull()
  })
})
