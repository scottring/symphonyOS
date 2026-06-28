import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WallV2NowNext } from './WallV2NowNext'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

function ti(over: Partial<TimelineItem>): TimelineItem {
  return { id: 't', type: 'task', title: 'Item', startTime: null, endTime: null, completed: false, ...over }
}

function day(items: Partial<Record<DaySection, TimelineItem[]>>): WallDayData {
  return {
    date: new Date(2026, 5, 28),
    isToday: true,
    items: { allday: [], morning: [], afternoon: [], evening: [], unscheduled: [], ...items },
    birthdays: [],
    milestones: [],
  }
}

const at = (h: number, m = 0) => new Date(2026, 5, 28, h, m, 0, 0)

describe('WallV2NowNext', () => {
  it('renders nothing when there is no current or next item', () => {
    const { container } = render(<WallV2NowNext today={day({})} familyMembers={[]} now={at(10)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the in-progress item as "Happening now" with its staged materials', () => {
    const today = day({
      morning: [ti({ id: 'task-1', title: 'Shoulder HEP', startTime: at(9), endTime: at(10), phoneNumber: '555-0100' })],
    })
    render(<WallV2NowNext today={today} familyMembers={[]} now={at(9, 30)} />)
    expect(screen.getByText('Shoulder HEP')).toBeInTheDocument()
    expect(screen.getByText(/Happening now/)).toBeInTheDocument()
    // staged phone material rendered as a tappable tile
    expect(screen.getByRole('link', { name: /Call 555-0100/ })).toHaveAttribute('href', 'tel:555-0100')
  })

  it('shows the soonest future item as "Next up"', () => {
    const today = day({
      afternoon: [ti({ id: 'task-2', title: 'Call Dr. Lewis', startTime: at(14), phoneNumber: '612-555-0148' })],
    })
    render(<WallV2NowNext today={today} familyMembers={[]} now={at(11)} />)
    expect(screen.getByText(/Next up/)).toBeInTheDocument()
    expect(screen.getByText('Call Dr. Lewis')).toBeInTheDocument()
  })

  it('skips completed items', () => {
    const today = day({
      morning: [ti({ id: 'task-3', title: 'Done thing', startTime: at(9), endTime: at(10), completed: true })],
    })
    const { container } = render(<WallV2NowNext today={today} familyMembers={[]} now={at(9, 30)} />)
    expect(container).toBeEmptyDOMElement()
  })
})
