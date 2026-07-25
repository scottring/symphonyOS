import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WallV2NowNext } from './WallV2NowNext'

const placeCall = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }))
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

  it('shows the in-progress item as "Happening now" with its staged materials', async () => {
    const today = day({
      morning: [ti({ id: 'task-1', title: 'Shoulder HEP', startTime: at(9), endTime: at(10), phoneNumber: '555-0100' })],
    })
    render(<WallV2NowNext today={today} familyMembers={[]} now={at(9, 30)} />)
    expect(screen.getByText('Shoulder HEP')).toBeInTheDocument()
    expect(screen.getByText(/Happening now/)).toBeInTheDocument()
    // On the wall the call tile is a button that places the call via Symphony
    // (tel: links don't work on the TV), not a tel: link.
    const callBtn = screen.getByRole('button', { name: /Call 555-0100/ })
    expect(callBtn).toBeInTheDocument()
    await userEvent.click(callBtn)
    expect(placeCall).toHaveBeenCalledWith({ toNumber: '555-0100', source: 'kiosk' })
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

  it('surfaces earlyMorning and night items instead of dropping them', () => {
    const today = day({
      earlyMorning: [ti({ id: 'task-4', title: '6 AM run', startTime: at(6), endTime: at(6, 30) })],
    })
    render(<WallV2NowNext today={today} familyMembers={[]} now={at(6, 10)} />)
    expect(screen.getByText('6 AM run')).toBeInTheDocument()
    expect(screen.getByText(/Happening now/)).toBeInTheDocument()

    const todayNight = day({
      night: [ti({ id: 'task-5', title: 'Lock up', startTime: at(22) })],
    })
    render(<WallV2NowNext today={todayNight} familyMembers={[]} now={at(20)} />)
    expect(screen.getByText('Lock up')).toBeInTheDocument()
    expect(screen.getByText(/Next up/)).toBeInTheDocument()
  })
})
