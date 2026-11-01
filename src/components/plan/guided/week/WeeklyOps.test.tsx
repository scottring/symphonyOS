import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { createMockRoutine } from '@/test/mocks/factories'
import type { RecurrencePattern } from '@/types/actionable'
import type { PlannedMeal } from '@/lib/mealDayRecipes'

const notes = vi.hoisted(() => ({ weekend: undefined as string | undefined, patch: vi.fn(async (_p: Record<string, unknown>) => true), loading: false, token: '' }))
vi.mock('@/hooks/usePlanningNotes', () => ({
  usePlanningNotes: (_h: string, token: string) => {
    notes.token = token
    return { notes: notes.weekend === undefined ? {} : { weekend: notes.weekend }, loading: notes.loading, error: null, patch: notes.patch, reload: vi.fn() }
  },
}))
const dinners = vi.hoisted(() => ({ map: new Map<string, PlannedMeal>(), args: [] as unknown[] }))
vi.mock('@/hooks/usePlannedDinners', () => ({ usePlannedDinners: (...a: unknown[]) => { dinners.args = a; return dinners.map } }))

import { WeeklyOps } from './WeeklyOps'
import { weekToken } from '@/hooks/usePlanningSession'

const weekStart = new Date(2026, 10, 1) // Sunday Nov 1
const daily = createMockRoutine({ id: 'dog', name: 'Walk the dog', time_of_day: '07:00:00', recurrence_pattern: { type: 'daily' } as RecurrencePattern })
const swim = createMockRoutine({ id: 'swim', name: 'Swim', time_of_day: '17:30:00', recurrence_pattern: { type: 'weekly', days: ['tue', 'thu'] } as RecurrencePattern })
const bins = createMockRoutine({ id: 'bins', name: 'Bins out', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['tue'] } as RecurrencePattern })

function Held(props: Omit<React.ComponentProps<typeof WeeklyOps>, 'draft' | 'onDraft'>) {
  const [draft, setDraft] = useState<string | null>(null)
  return <WeeklyOps {...props} draft={draft} onDraft={setDraft} />
}
const mount = (routines = [daily, swim, bins]) => render(<MemoryRouter><Held weekStart={weekStart} routines={routines} /></MemoryRouter>)

beforeEach(() => {
  notes.weekend = undefined; notes.loading = false
  notes.patch.mockReset(); notes.patch.mockImplementation(async () => true)
  dinners.map = new Map()
})

describe('WeeklyOps — step 6, the week’s running order', () => {
  it('lists the week’s dinners from the meal plan, and opens the meal plan on this week', () => {
    dinners.map = new Map([
      ['2026-11-02', { dateKey: '2026-11-02', title: 'Tacos' }],
      ['2026-11-04', { dateKey: '2026-11-04', title: 'Soup', recipeId: 'r1' }],
    ])
    mount()
    expect(dinners.args).toEqual([weekStart, 7])
    const list = within(screen.getByRole('list', { name: 'Dinners' }))
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Sun 1No dinner yet', 'Mon 2Tacos', 'Tue 3No dinner yet', 'Wed 4Soup', 'Thu 5No dinner yet', 'Fri 6No dinner yet', 'Sat 7No dinner yet',
    ])
    expect(screen.getByRole('link', { name: 'Open the meal plan' })).toHaveAttribute('href', '/meals/plan?week=2026-11-01')
  })

  it('an empty meal plan says so, and still links to it', () => {
    mount()
    expect(screen.getByText('No dinners on the meal plan this week.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Dinners' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the meal plan' })).toBeInTheDocument()
  })

  it('lists the week’s routines by day: every-day ones once, the rest on their days, by time', () => {
    mount()
    expect(screen.getByText('Every day:')).toBeInTheDocument()
    expect(screen.getByText('7a Walk the dog')).toBeInTheDocument()
    const days = within(screen.getByRole('list', { name: 'Routines by day' }))
    expect(days.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Tue 3' + '5:30p Swim · Bins out', 'Thu 5' + '5:30p Swim',
    ])
  })

  it('no routines: says so', () => {
    mount([])
    expect(screen.getByText('No routines this week.')).toBeInTheDocument()
  })

  it('the weekend note saves on its own row through patch({ weekend })', async () => {
    notes.weekend = 'Rest'
    mount()
    expect(notes.token).toBe(weekToken(weekStart))
    const box = screen.getByLabelText('What the weekend is for')
    expect(box).toHaveValue('Rest')
    fireEvent.change(box, { target: { value: 'Rest, and the lake on Saturday' } })
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save weekend note' })) })
    expect(notes.patch).toHaveBeenCalledWith({ weekend: 'Rest, and the lake on Saturday' })
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })

  it('a weekend note that did not save says so and keeps what was typed', async () => {
    notes.patch.mockImplementation(async () => false)
    mount()
    fireEvent.change(screen.getByLabelText('What the weekend is for'), { target: { value: 'Lake' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save weekend note' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
    expect(screen.getByLabelText('What the weekend is for')).toHaveValue('Lake')
  })
})
