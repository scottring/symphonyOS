import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekJournal, type JournalDay } from './WeekJournal'

// Walkthrough 2026-09-20: "there's no way in the UI to add a task straight to
// a day on week." Each day now has its own add, like Today's.
function day(d: Date): JournalDay {
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date: d, key, notes: [], entries: [], available: [], dinners: [] }
}

describe('WeekJournal — add straight to a day', () => {
  it('reveals an input on "Add to <weekday>" and hands the title and the day back', () => {
    const onAddToDay = vi.fn()
    const wed = new Date(2026, 8, 23)
    render(
      <DndContext>
        <WeekJournal days={[day(wed)]} spans={[]} onSelectItem={() => {}} onToggleEntry={() => {}} onAddToDay={onAddToDay} />
      </DndContext>,
    )
    const row = within(screen.getByTestId('journal-day-2026-09-23'))
    fireEvent.click(row.getByRole('button', { name: 'Add to Wednesday' }))
    const input = row.getByLabelText('New task for Wednesday')
    fireEvent.change(input, { target: { value: 'Call the plumber' } })
    fireEvent.submit(input.closest('form')!)
    expect(onAddToDay).toHaveBeenCalledWith(expect.objectContaining({ key: '2026-09-23' }), 'Call the plumber')
    // Back to the quiet control after a submit.
    expect(row.getByRole('button', { name: 'Add to Wednesday' })).toBeInTheDocument()
  })

  it('offers no control when the host gives no handler', () => {
    render(
      <DndContext>
        <WeekJournal days={[day(new Date(2026, 8, 23))]} spans={[]} onSelectItem={() => {}} onToggleEntry={() => {}} />
      </DndContext>,
    )
    expect(screen.queryByRole('button', { name: /Add to/ })).not.toBeInTheDocument()
  })
})
