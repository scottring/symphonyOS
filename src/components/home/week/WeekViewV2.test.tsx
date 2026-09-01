import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { WeekViewV2 } from './WeekViewV2'
import { createMockRoutine } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'

const monday = new Date(2026, 4, 18) // Monday

const defaultProps = {
  tasks: [] as Task[],
  events: [] as CalendarEvent[],
  dateInstances: [],
  weekStart: monday,
  onWeekChange: vi.fn(),
  onSelectItem: vi.fn(),
  onUpdateTask: vi.fn(),
  onUpdateEvent: vi.fn(),
  onUpdateRoutine: vi.fn(),
  layers: ALL_LAYERS,
}

function mockEvent(over: { id: string; title: string; start: string; end: string }): CalendarEvent {
  return {
    id: over.id,
    title: over.title,
    start_time: over.start,
    end_time: over.end,
  } as unknown as CalendarEvent
}

describe('WeekViewV2 week extras', () => {
  it('moves dinner into the dinner row and specials into the School subtitle', () => {
    const events = [
      mockEvent({ id: 'sch', title: 'School — Ella & Kaleb', start: '2026-05-18T08:00:00', end: '2026-05-18T15:00:00' }),
      mockEvent({ id: 'din', title: 'Dinner: Salmon + potatoes', start: '2026-05-18T07:40:00', end: '2026-05-18T08:00:00' }),
      mockEvent({ id: 'spc', title: 'Specials — Ella: Library', start: '2026-05-18T07:45:00', end: '2026-05-18T08:00:00' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} events={events} />)
    expect(screen.getByText('Salmon + potatoes')).toBeInTheDocument()
    expect(screen.getByText('Ella: Library')).toBeInTheDocument()
    expect(screen.queryByText(/^Dinner:/)).toBeNull()
    expect(screen.queryByText(/^Specials/)).toBeNull()
  })

  it('keeps specials as a grid block on a day with no School event', () => {
    const events = [
      mockEvent({ id: 'spc', title: 'Specials — Ella: Library', start: '2026-05-18T07:45:00', end: '2026-05-18T08:00:00' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} events={events} />)
    expect(screen.getByText('Specials — Ella: Library')).toBeInTheDocument()
  })
})

describe('WeekViewV2 routine visibility', () => {
  it('narrows routines to the selected assignee (rung 5 wiring)', async () => {
    // Regression test for the prop-threading itself, not resolveRoutine's own
    // member-narrowing logic (already exhaustively covered by
    // routineUtils.resolveRoutine.test.ts). If WeekViewV2 stopped passing
    // `member: selectedAssignees` into resolveRoutine's ctx — the exact bug
    // this task fixed — Iris's routine would render again on the grid
    // regardless of the selection, and this test would fail.
    const routines = [
      createMockRoutine({ name: 'Scott Routine', assigned_to: 'scott' }),
      createMockRoutine({ name: 'Iris Routine', assigned_to: 'iris' }),
    ]

    render(
      <WeekViewV2
        {...defaultProps}
        routines={routines}
        selectedAssignees={['scott']}
      />
    )

    // Scott's own routine still renders (once per day it recurs on — daily,
    // so every day of the visible week).
    expect((await screen.findAllByText('Scott Routine')).length).toBeGreaterThan(0)
    // Iris's routine — not owned by the selected member — is gone entirely.
    expect(screen.queryByText('Iris Routine')).toBeNull()
  })
})
