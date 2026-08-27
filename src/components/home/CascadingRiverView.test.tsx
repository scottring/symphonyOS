import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { CascadingRiverView, ownsIt } from './CascadingRiverView'
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

/**
 * Minimal object matching the (unexported) `TimelineEvent` shape `ownsIt`
 * accepts. Only the fields `ownsIt` reads are meaningful; the rest are
 * present so the object structurally satisfies the parameter type.
 */
function timelineEvent(overrides: { assignedTo?: string | null; owners?: string[] }) {
  return {
    id: 'e1',
    prefixedId: 'routine-e1',
    title: 'Event',
    startTime: new Date(),
    isAllDay: false,
    type: 'routine' as const,
    assignedTo: null as string | null,
    ...overrides,
  }
}

describe('ownsIt — per-stream membership (unit, real predicate)', () => {
  it('a multi-owner routine event belongs to every owner\'s stream', () => {
    const multiOwnerEvent = timelineEvent({ assignedTo: null, owners: ['scott', 'iris'] })
    expect(ownsIt(multiOwnerEvent, 'scott')).toBe(true)
    expect(ownsIt(multiOwnerEvent, 'iris')).toBe(true)
    expect(ownsIt(multiOwnerEvent, 'ella')).toBe(false)
  })

  it('positive control: a single-assignee event still belongs to exactly one stream', () => {
    const soloEvent = timelineEvent({ assignedTo: 'scott' })
    expect(ownsIt(soloEvent, 'scott')).toBe(true)
    expect(ownsIt(soloEvent, 'iris')).toBe(false)
  })
})

describe('CascadingRiverView — routine visibility (render)', () => {
  // NOTE ON SCOPE: this suite proves the visibility GATE (resolveRoutine.shows)
  // via real DOM — a multi-owner routine's card is present, a not-selected
  // owner's card is absent, alongside a same-code-path positive control. It
  // does NOT and cannot currently prove PER-STREAM attribution (that the
  // multi-owner card visually belongs to both Scott's and Iris's streams):
  // the "Event cards" render is a single flat pass over `timelineEvents`
  // (one <EventCard> per event, keyed by prefixedId), not a per-stream pass,
  // so a shared routine renders once, at one fallback position/colour,
  // regardless of how many streams' `.events` arrays (see `ownsIt` above)
  // claim it. That data-level per-stream membership is covered by the
  // `ownsIt` unit tests above instead, since it has no DOM manifestation to
  // assert on without restructuring that render loop (out of scope here —
  // see the comments on `getCardX` in CascadingRiverView.tsx).
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
