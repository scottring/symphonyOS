import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { CascadingRiverView } from './CascadingRiverView'
import { createMockRoutine } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'

// A fixed date whose weekday doesn't matter — every routine here recurs
// 'daily' (the factory default), so any date matches rung 2.
const VIEWED_DATE = new Date(2026, 7, 24, 9, 0, 0)

function member(overrides: Partial<FamilyMember>): FamilyMember {
  return {
    id: 'scott',
    user_id: 'user-1',
    name: 'Scott',
    initials: 'S',
    color: 'blue',
    avatar_url: null,
    is_full_user: true,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    member_type: 'core',
    ...overrides,
  }
}

const FAMILY_MEMBERS: FamilyMember[] = [
  member({ id: 'scott', name: 'Scott', initials: 'S' }),
  member({ id: 'iris', name: 'Iris', initials: 'I', color: 'purple' }),
]

const BASE_PROPS = {
  tasks: [] as Task[],
  events: [] as CalendarEvent[],
  dateInstances: [],
  selectedItemId: null,
  onSelectItem: vi.fn(),
  onToggleTask: vi.fn(),
  viewedDate: VIEWED_DATE,
  onDateChange: vi.fn(),
  familyMembers: FAMILY_MEMBERS,
  selectedAssignees: ['scott', 'iris'],
}

describe('CascadingRiverView — routine visibility (render)', () => {
  it('renders a multi-assigned routine (assigned_to_all) alongside a positive control, and excludes a routine owned by nobody selected', () => {
    const multi = createMockRoutine({
      name: 'Multi Owner Routine',
      assigned_to: null,
      assigned_to_all: ['scott', 'iris'],
      time_of_day: '09:00',
    })
    // Positive control: proves the render path for a routine card is live —
    // if this weren't present, an absent `multi` card would prove nothing.
    const control = createMockRoutine({
      name: 'Scott Solo Routine',
      assigned_to: 'scott',
      time_of_day: '10:00',
    })
    // Negative control: owned by someone not in the selection — must still
    // be excluded after the migration.
    const notTheirs = createMockRoutine({
      name: 'Ella Only Routine',
      assigned_to: 'ella',
      time_of_day: '11:00',
    })

    render(
      <CascadingRiverView
        {...BASE_PROPS}
        routines={[multi, control, notTheirs]}
      />
    )

    expect(screen.getByText('Scott Solo Routine')).toBeInTheDocument()
    expect(screen.getByText('Multi Owner Routine')).toBeInTheDocument()
    expect(screen.queryByText('Ella Only Routine')).not.toBeInTheDocument()
  })
})
