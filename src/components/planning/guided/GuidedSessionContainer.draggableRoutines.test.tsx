import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import type { ReactNode } from 'react'
import { createMockRoutine, resetIdCounter } from '@/test/mocks/factories'
import type { Routine } from '@/types/actionable'

// GuidedSessionContainer.pickedAt.test.tsx already notes the container is
// hard to mount whole (it wires ~9 app-level hooks and a multi-step wizard),
// and asserts at a unit boundary instead. This test still renders the REAL
// GuidedSessionContainer — so the actual `draggableRoutines` line inside it
// runs — but stubs its immediate child, GuidedSession, so the test doesn't
// have to navigate the wizard to reach the "place-rocks" step. GuidedSession
// itself is already covered separately by GuidedSession.test.tsx with a
// hand-built host.
let capturedDraggableRoutines: Routine[] = []
vi.mock('./GuidedSession', () => ({
  // registerStepType/getRegisteredTypes are re-exported here because
  // './stepTypes' (imported for its registration side effect, transitively
  // via GuidedSessionContainer) calls registerStepType against THIS module
  // path at import time — mocking the module wholesale means it has to keep
  // satisfying that side effect too, even though this test never renders a
  // step.
  registerStepType: () => {},
  getRegisteredTypes: () => [],
  GuidedSession: (props: { host: { draggableRoutines: Routine[] } }) => {
    capturedDraggableRoutines = props.host.draggableRoutines
    return (
      <div>
        {props.host.draggableRoutines.map((r) => (
          <div key={r.id}>{r.name}</div>
        ))}
      </div>
    )
  },
}))

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    tasks: [], loading: false, addTask: vi.fn(), toggleTask: vi.fn(), updateTask: vi.fn(),
    pushTask: vi.fn(), setBucket: vi.fn(), deleteTask: vi.fn(),
  }),
}))
vi.mock('@/contexts/GoalsContext', () => ({
  useGoalsContext: () => ({ areas: [], goals: [], addGoal: vi.fn(), addArea: vi.fn(), updateGoal: vi.fn() }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ projects: [], projectsMap: new Map() }),
}))
vi.mock('@/hooks/useUpkeepList', () => ({
  useUpkeepList: () => ({ upkeepItems: [], upkeepLoading: false, ensureUpkeepList: vi.fn() }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ getCurrentUserMember: () => undefined }),
}))
vi.mock('@/hooks/useDomain', () => ({
  // test-utils.tsx's AllTheProviders wraps every render in the real
  // DomainProvider, so the mock has to keep providing one too.
  DomainProvider: ({ children }: { children: ReactNode }) => children,
  useDomain: () => ({ currentDomain: 'universal' }),
}))
vi.mock('@/hooks/useCalendarDomainMappings', () => ({
  useCalendarDomainMappings: () => ({ getDomainForCalendar: () => null }),
}))

// The routine under test: recurs ONLY on Thursday. ScheduleGridStep's
// "place-rocks" grid spans up to 7 days from the week's start (Monday) — this
// routine must still be offered as a drag chip even though it doesn't recur
// on day one of that range. That is the exact regression fix round 1 caught:
// a single `date` (previously `sessionDate`, Monday) passed into
// resolveRoutine's rung 2 made every routine not recurring on THAT day
// silently vanish from the drawer, even though the grid shows all 7 days.
const laterInWeekRoutine = createMockRoutine({
  id: 'r-thursday-only',
  name: 'Thursday-only errand',
  recurrence_pattern: { type: 'weekly', days: ['thu'] },
  time_of_day: null,
})

// Negative control: this routine is date-agnostically INeligible — resting
// (`visibility: 'reference'`, resolveRoutine's rung 1) — not merely absent
// from one day's recurrence. It is otherwise identical to the routine above
// (untimed, so it clears the isDraggableRoutine check) so the only thing
// that can exclude it is resolveRoutineEligible's own verdict. Without this,
// the test above only proves an included routine is present — swapping
// `.shows` for `true` in the production filter would still pass it.
const restingRoutine = createMockRoutine({
  id: 'r-resting',
  name: 'Resting routine',
  visibility: 'reference',
  time_of_day: null,
})

vi.mock('@/hooks/useRoutines', () => ({
  useRoutines: () => ({
    routines: [laterInWeekRoutine, restingRoutine],
    getRoutinesForDate: () => [],
  }),
}))

import { GuidedSessionContainer } from './GuidedSessionContainer'

describe('GuidedSessionContainer — draggableRoutines is date-agnostic (fix round 1)', () => {
  it('offers a routine that recurs only later in the week as a drag candidate', () => {
    resetIdCounter()
    capturedDraggableRoutines = []
    render(
      <GuidedSessionContainer
        horizon="weekly"
        onClose={vi.fn()}
        onScheduleRoutine={vi.fn()}
      />
    )

    expect(screen.getByText('Thursday-only errand')).toBeInTheDocument()
    expect(capturedDraggableRoutines.map((r) => r.id)).toContain('r-thursday-only')
  })

  it('excludes a resting routine from the drag pool (negative control)', () => {
    resetIdCounter()
    capturedDraggableRoutines = []
    render(
      <GuidedSessionContainer
        horizon="weekly"
        onClose={vi.fn()}
        onScheduleRoutine={vi.fn()}
      />
    )

    expect(screen.queryByText('Resting routine')).not.toBeInTheDocument()
    expect(capturedDraggableRoutines.map((r) => r.id)).not.toContain('r-resting')
  })
})
