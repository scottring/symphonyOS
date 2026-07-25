// src/components/schedule/PrintableDayList.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PrintableDayList } from './PrintableDayList'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import { SECTIONS_ORDER } from '@/lib/today/types'

// The real order, not a five-name copy — a literal here would keep asserting
// against a day that has no earlyMorning or night band.
const SECTIONS = SECTIONS_ORDER
const DATE = new Date(2026, 6, 25)

const item = (over: Partial<TimelineItem>): TimelineItem => ({
  id: 't1', type: 'task', title: 'Untitled', startTime: null, endTime: null, completed: false,
  ...over,
}) as TimelineItem

describe('PrintableDayList', () => {
  it('names the day and counts what is left to do', () => {
    render(
      <PrintableDayList
        date={DATE}
        sectionsOrder={SECTIONS}
        grouped={{ morning: [item({ id: 'a', title: 'Iris long run' })] }}
      />,
    )
    expect(screen.getByText(/Saturday, July 25, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/1 to do/)).toBeInTheDocument()
  })

  it('lists open items under their section, with a clock time when there is one', () => {
    render(
      <PrintableDayList
        date={DATE}
        sectionsOrder={SECTIONS}
        grouped={{ morning: [item({ id: 'a', title: 'Iris long run', startTime: new Date(2026, 6, 25, 9, 0) })] }}
      />,
    )
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Iris long run')).toBeInTheDocument()
    expect(screen.getByText('9:00 AM')).toBeInTheDocument()
  })

  it('shows no time for an all-day item — midnight is not a time you act on', () => {
    const { container } = render(
      <PrintableDayList
        date={DATE}
        sectionsOrder={SECTIONS}
        grouped={{ allday: [item({ id: 'a', title: 'Buy a bike lock', startTime: new Date(2026, 6, 25, 0, 0) })] }}
      />,
    )
    expect(container.querySelector('.day-print-time')!.textContent).toBe('')
  })

  it('omits completed and skipped rows but reports the done count', () => {
    render(
      <PrintableDayList
        date={DATE}
        sectionsOrder={SECTIONS}
        grouped={{
          morning: [
            item({ id: 'a', title: 'Still open' }),
            item({ id: 'b', title: 'Already finished', completed: true }),
            item({ id: 'c', title: 'Skipped one', skipped: true }),
          ],
        }}
      />,
    )
    expect(screen.getByText('Still open')).toBeInTheDocument()
    expect(screen.queryByText('Already finished')).not.toBeInTheDocument()
    expect(screen.queryByText('Skipped one')).not.toBeInTheDocument()
    expect(screen.getByText(/1 to do · 1 already done/)).toBeInTheDocument()
  })

  it('prints carried-over items under their own heading', () => {
    const overdue = [
      { id: 'o1', title: 'Ask for ynab refund', completed: false } as unknown as Task,
    ]
    render(
      <PrintableDayList date={DATE} sectionsOrder={SECTIONS} grouped={{}} overdue={overdue} />,
    )
    const section = screen.getByText('Carried over').closest('section')!
    expect(within(section).getByText('Ask for ynab refund')).toBeInTheDocument()
  })

  it('drops empty sections entirely — a printed list has no empty headings', () => {
    render(
      <PrintableDayList
        date={DATE}
        sectionsOrder={SECTIONS}
        grouped={{ morning: [item({ id: 'a', title: 'One thing' })], evening: [] }}
      />,
    )
    expect(screen.queryByText('Evening')).not.toBeInTheDocument()
    expect(screen.queryByText('Afternoon')).not.toBeInTheDocument()
  })

  it('says so plainly when the day is clear', () => {
    render(<PrintableDayList date={DATE} sectionsOrder={SECTIONS} grouped={{}} />)
    expect(screen.getByText('Nothing left on this day.')).toBeInTheDocument()
  })

  it('is hidden on screen — it costs nothing until you print', () => {
    render(<PrintableDayList date={DATE} sectionsOrder={SECTIONS} grouped={{}} />)
    expect(screen.getByTestId('printable-day-list').className).toContain('print-only')
  })
})
