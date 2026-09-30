import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekJournal, type JournalDay } from './WeekJournal'

// Scott, 2026-09-30: "can we show little weather indicators on the week
// page days of week?" A day with a forecast wears its sky and high; a day
// without one (the past, or past the forecast's reach) says nothing.
function day(d: Date): JournalDay {
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date: d, key, notes: [], entries: [], available: [], dinners: [] }
}

describe('WeekJournal — the forecast under each day', () => {
  const tue = day(new Date(2026, 8, 29))
  const wed = day(new Date(2026, 8, 30))
  const forecast = { '2026-09-30': { date: '2026-09-30', code: 2, high: 78, low: 62 } }

  it('shows the sky, high and low on a day that has a forecast', () => {
    render(<DndContext><WeekJournal days={[tue, wed]} spans={[]} onSelectItem={() => {}} onToggleEntry={() => {}} forecast={forecast} /></DndContext>)
    const row = within(screen.getByTestId('journal-day-2026-09-30'))
    expect(row.getByRole('img', { name: 'Partly Cloudy, high 78°, low 62°' })).toBeInTheDocument()
    expect(row.getByText('78°')).toBeInTheDocument()
    expect(row.getByText('62°')).toBeInTheDocument()
  })

  it('leaves a day without a forecast bare', () => {
    render(<DndContext><WeekJournal days={[tue, wed]} spans={[]} onSelectItem={() => {}} onToggleEntry={() => {}} forecast={forecast} /></DndContext>)
    expect(within(screen.getByTestId('journal-day-2026-09-29')).queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps only the high on a narrow screen', () => {
    render(<DndContext><WeekJournal days={[wed]} spans={[]} onSelectItem={() => {}} onToggleEntry={() => {}} forecast={forecast} narrow /></DndContext>)
    const row = within(screen.getByTestId('journal-day-2026-09-30'))
    expect(row.getByText('78°')).toBeInTheDocument()
    expect(row.queryByText('62°')).not.toBeInTheDocument()
  })
})
