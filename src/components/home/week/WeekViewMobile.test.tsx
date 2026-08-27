import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeekViewMobile } from './WeekViewMobile'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

const baseProps = {
  tasks: [],
  events: [],
  routines: [],
  weekStart: new Date(2026, 4, 17),
  onSelectItem: vi.fn(),
}

describe('WeekViewMobile', () => {
  it('renders the 7 day headers (Sun..Sat) when no data', () => {
    render(<WeekViewMobile {...baseProps} />)
    expect(screen.getByText(/Sunday/i)).toBeInTheDocument()
    expect(screen.getByText(/Saturday/i)).toBeInTheDocument()
  })

  it('renders an unscheduled-tasks section when isAllDay tasks exist for the week', () => {
    const t = {
      id: 't1', title: 'Order shoes', completed: false,
      scheduledFor: new Date(2026, 4, 20), isAllDay: true,
    } as never
    render(<WeekViewMobile {...baseProps} tasks={[t]} />)
    expect(screen.getByText('Order shoes')).toBeInTheDocument()
    expect(screen.getByText(/unscheduled this week/i)).toBeInTheDocument()
  })

  it('does not render the unscheduled section when nothing is unscheduled', () => {
    render(<WeekViewMobile {...baseProps} />)
    expect(screen.queryByText(/unscheduled this week/i)).not.toBeInTheDocument()
  })

  it('renders calendar events in the appropriate day section', () => {
    // 2026-05-19 is a Tuesday at 10:00 AM
    const tuesday = new Date(2026, 4, 19, 10, 0)
    const events = [{
      id: 'ev-1',
      title: 'Standup',
      startTime: tuesday.toISOString(),
      endTime: new Date(tuesday.getTime() + 30 * 60 * 1000).toISOString(),
    }] as unknown as CalendarEvent[]
    const monday = new Date(2026, 4, 18)
    render(
      <WeekViewMobile
        tasks={[]}
        events={events}
        routines={[]}
        weekStart={monday}
        onSelectItem={() => {}}
      />
    )
    expect(screen.getByText('Standup')).toBeInTheDocument()
  })

  it('renders routines on every day in the week', () => {
    const routines = [{
      id: 'r-1',
      name: 'Morning meds',
      time_of_day: '08:00',
      visibility: 'active',
      recurrence_pattern: { type: 'daily' },
    }] as unknown as Routine[]
    const monday = new Date(2026, 4, 18)
    render(
      <WeekViewMobile
        tasks={[]}
        events={[]}
        routines={routines}
        weekStart={monday}
        onSelectItem={() => {}}
      />
    )
    const matches = screen.getAllByText('Morning meds')
    expect(matches).toHaveLength(7)  // default dayCount = 7
  })

  it('narrows routines to the selected assignee (rung 5 wiring)', () => {
    // Regression test for the prop-threading itself, not resolveRoutine's own
    // member-narrowing logic (already exhaustively covered by
    // routineUtils.resolveRoutine.test.ts). If WeekViewMobile stopped passing
    // `member: selectedAssignees` into resolveRoutine's ctx — the exact bug
    // this task fixed — Iris's routine would render again regardless of the
    // selection, and this test would fail.
    const routines = [
      {
        id: 'r-scott', name: 'Scott Routine', time_of_day: '08:00',
        visibility: 'active', recurrence_pattern: { type: 'daily' },
        assigned_to: 'scott',
      },
      {
        id: 'r-iris', name: 'Iris Routine', time_of_day: '09:00',
        visibility: 'active', recurrence_pattern: { type: 'daily' },
        assigned_to: 'iris',
      },
    ] as unknown as Routine[]
    const monday = new Date(2026, 4, 18)
    render(
      <WeekViewMobile
        tasks={[]}
        events={[]}
        routines={routines}
        weekStart={monday}
        selectedAssignees={['scott']}
        onSelectItem={() => {}}
      />
    )
    // Scott's own routine still renders on every day...
    expect(screen.getAllByText('Scott Routine')).toHaveLength(7)
    // ...but Iris's routine — not owned by the selected member — is gone.
    expect(screen.queryByText('Iris Routine')).toBeNull()
  })

  it('renders only 5 day sections when dayCount=5', () => {
    const monday = new Date(2026, 4, 18)
    render(
      <WeekViewMobile
        tasks={[]}
        events={[]}
        routines={[]}
        weekStart={monday}
        dayCount={5}
        onSelectItem={() => {}}
      />
    )
    // Sat (May 23) and Sun (May 24) should not appear
    expect(screen.queryByText(/saturday/i)).toBeNull()
    expect(screen.queryByText(/sunday/i)).toBeNull()
  })
})
