import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'

// Isolate the glance logic from the weather/auth/supabase chain.
vi.mock('./WeatherChip', () => ({ WeatherChip: () => null }))

import { DayGlancePane } from './DayGlancePane'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'

// A fixed non-today date so isToday is false → no now-relative filtering (deterministic).
const DAY = new Date(2099, 0, 15) // Jan 15 2099
const at = (h: number, m = 0) => new Date(2099, 0, 15, h, m)

const member = (id: string, name: string): FamilyMember =>
  ({ id, name, member_type: 'core', color: 'blue', avatar_url: null } as unknown as FamilyMember)

const task = (id: string, title: string, when: Date, assignee?: string): Task =>
  ({ id, title, completed: false, scheduledFor: when, assignedToAll: assignee ? [assignee] : [] } as unknown as Task)

const event = (id: string, title: string, start: Date): CalendarEvent =>
  ({ id, title, start_time: start.toISOString(), all_day: false } as unknown as CalendarEvent)

describe('DayGlancePane', () => {
  it('shows the next timed event, evening tasks under Tonight, and per-member load', () => {
    render(
      <DayGlancePane
        viewedDate={DAY}
        tasks={[task('t1', 'Homework', at(19), 'm1'), task('t2', 'Morning run', at(7))]}
        events={[event('e1', 'Haircut', at(17, 30)), event('e2', 'Standup', at(9))]}
        familyMembers={[member('m1', 'Scott'), member('m2', 'Iris')]}
      />,
    )
    // Next event = earliest timed event on the day
    expect(screen.getByText('Standup')).toBeInTheDocument()
    // Tonight = evening (5pm+) task
    expect(screen.getByText('Homework')).toBeInTheDocument()
    // Morning task is NOT tonight
    expect(screen.queryByText('Morning run')).not.toBeInTheDocument()
    // Family roster present
    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
  })

  it('renders calm empty states when nothing is scheduled', () => {
    render(<DayGlancePane viewedDate={DAY} tasks={[]} events={[]} familyMembers={[]} />)
    expect(screen.getByText(/no events/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing scheduled for tonight/i)).toBeInTheDocument()
  })
})
