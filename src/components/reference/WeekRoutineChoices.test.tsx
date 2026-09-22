import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WeekRoutineChoices } from './WeekRoutineChoices'
import type { DayPlanEntry } from '@/lib/today/dayPlan'
const entry: DayPlanEntry = { id: 'read', key: 'routine:read', kind: 'routine', title: 'Read', completed: false, planned: false, group: 'available' }
const monday = new Date(2026, 8, 21), tuesday = new Date(2026, 8, 22)
const days = [{ date: monday, entries: [entry] }, { date: tuesday, entries: [entry] }]

describe('Week routine choices', () => {
  it('chooses the selected occurrence, not today or the repeating rule', async () => {
    const onChoose = vi.fn().mockResolvedValue(true)
    render(<WeekRoutineChoices days={days} onChoose={onChoose} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Routine day' }), { target: { value: '2026-09-21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Read to Monday' }))
    expect(await screen.findByText('Added')).toBeInTheDocument()
    expect(onChoose).toHaveBeenCalledWith(entry, monday)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2026-09-22' } })
    expect(screen.getByRole('button', { name: 'Add Read to Tuesday' })).toBeEnabled()
  })
  it('leaves a failed occurrence available to retry', async () => {
    render(<WeekRoutineChoices days={[days[0]]} onChoose={vi.fn().mockResolvedValue(false)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Read to Monday' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add')
    expect(screen.getByRole('button', { name: 'Add Read to Monday' })).toBeEnabled()
  })
})
