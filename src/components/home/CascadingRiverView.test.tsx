import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@/test/test-utils'
import { CascadingRiverView, ownsIt } from './CascadingRiverView'
import { createMockRoutine } from '@/test/mocks/factories'
import { writeHideRoutines } from '@/lib/hideRoutinesSignal'
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
  // NOTE ON SCOPE: this suite proves (1) the visibility GATE
  // (resolveRoutine.shows) — a multi-owner routine's card is present, a
  // not-selected owner's card is absent, alongside a same-code-path positive
  // control — and (2) that a multi-owner routine attaches to its FIRST
  // owner's stream (correct position), not the unattributed fallback. It
  // does NOT and cannot currently prove attribution to EVERY owner's stream
  // (that the multi-owner card visually belongs to both Scott's and Iris's
  // streams at once): the "Event cards" render is a single flat pass over
  // `timelineEvents` (one <EventCard> per event, keyed by prefixedId), not a
  // per-stream pass, so a shared routine renders exactly once, under its
  // first owner only, regardless of how many streams' `.events` arrays (see
  // `ownsIt` above) claim it. That broader data-level per-stream membership
  // is covered by the `ownsIt` unit tests above instead, since it has no DOM
  // manifestation to assert on without restructuring that render loop (out
  // of scope here — see the comments on `getCardX`/`streamConfigs` in
  // CascadingRiverView.tsx).
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

  it('attributes a multi-owner routine to its FIRST owner\'s stream (correct position), not the unattributed fallback', () => {
    // Positive control: a plain single-assignee routine, assigned to 'scott'
    // via the singular column exactly as before.
    const control = createMockRoutine({
      name: 'Solo Control',
      assigned_to: 'scott',
      time_of_day: '10:00',
    })
    // First owner is 'scott' — should attach to the SAME stream position as
    // the control above, rather than the unattributed fallback (x = 100,
    // distinct from any real stream's baseX + 20 — confirmed by direct
    // inspection during development: attached = translate(60, ...),
    // fallback = translate(100, ...) under this test's fixed member count).
    const multi = createMockRoutine({
      name: 'Multi Owner',
      assigned_to: null,
      assigned_to_all: ['scott', 'iris'],
      time_of_day: '09:00',
    })

    render(
      <CascadingRiverView
        {...BASE_PROPS}
        routines={[multi, control]}
      />
    )

    const getCardTransformX = (title: string): number => {
      const node = screen.getByText(title)
      const transform = node.closest('g[transform]')?.getAttribute('transform')
      const match = transform?.match(/translate\(([-\d.]+),/)
      if (!match) throw new Error(`no g[transform] ancestor found for "${title}" (got: ${transform})`)
      return Number(match[1])
    }

    const controlX = getCardTransformX('Solo Control')
    const multiX = getCardTransformX('Multi Owner')

    // The control proves 60 (this fixture's attached-to-scott baseX + 20) is
    // NOT the unattributed fallback (100) — i.e. this comparison is live,
    // not vacuous.
    expect(controlX).not.toBe(100)
    // The real assertion: the multi-owner routine lands at the SAME x as the
    // control, because both are now attributed to 'scott' (first owner) —
    // not at the fallback x that an unattributed event renders at.
    expect(multiX).toBe(controlX)
    expect(multiX).not.toBe(100)
  })
})

describe('CascadingRiverView responds to the "hide daily routines" toggle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Regression test: the river used to hardcode `hideRoutines: false` at its
  // resolveRoutine call site, so the app-wide "hide daily routines" toggle
  // (symphony-hide-routines) silently did nothing here even though Today/Week
  // already honored it. An everyday (daily, unpinned) routine owned by a
  // selected member must be visible with the toggle off and gone once it's
  // flipped on — both assertions in play so neither can pass vacuously.
  it('hides an everyday routine once the toggle is switched on, and shows it again when off', () => {
    const routine = createMockRoutine({
      name: 'Daily Routine',
      assigned_to: 'scott',
      time_of_day: '09:00',
    }) // factory default recurrence: daily, unpinned

    render(<CascadingRiverView {...BASE_PROPS} routines={[routine]} />)

    expect(screen.getByText('Daily Routine')).toBeInTheDocument()

    act(() => writeHideRoutines(true))

    expect(screen.queryByText('Daily Routine')).not.toBeInTheDocument()

    act(() => writeHideRoutines(false))

    expect(screen.getByText('Daily Routine')).toBeInTheDocument()
  })
})
