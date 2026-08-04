import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { computeTodayData } from '@/lib/today/computeTodayData'
import { TodayView } from './TodayView'
import type { Task } from '@/types/task'
import type { TodayDataInput } from '@/lib/today/types'
import { sundayOfWeek } from '@/lib/weekHelpers'

/**
 * The invariant the redesign rests on: anything on Today that is not a
 * commitment gets a fixed budget that does not grow with backlog size.
 *
 * Every one of the six pools Today used to render arrived for a defensible
 * reason and none was ever removed. A stated, tested invariant is what stops
 * the seventh.
 *
 * Guarded at TWO levels, because the historical failure was in the UI, not in
 * the data layer:
 *
 *  - the data-layer tests below pin `computeTodayData`, and
 *  - the PAGE test pins the rendered output. A seventh pool rendered straight
 *    from the `tasks` prop — bypassing `computeTodayData` entirely, exactly as
 *    PullStrip and StagingFloat did — passes every data-layer assertion here
 *    and would ship. Only rendering Today catches it.
 *
 * The mock stack below is the one from AnytimeRow.test.tsx. It is duplicated
 * rather than imported because `vi.mock` is hoisted per test FILE and cannot
 * be shared through a helper module.
 */

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({ isPinned: () => false, pin: vi.fn(), unpin: vi.fn() }) }))
vi.mock('@/hooks/useActionQueue', () => ({ useActionQueue: () => ({ actions: [], loading: false, approveAction: vi.fn(), rejectAction: vi.fn(), pendingCount: 0, refetch: vi.fn() }) }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', setDomain: vi.fn() }) }
})
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

function task(p: Partial<Task>): Task {
  return {
    id: 'id',
    title: 't',
    completed: false,
    bucket: 'timed',
    scheduledFor: null,
    assignedTo: null,
    createdAt: new Date('2026-05-19T12:00:00'),
    updatedAt: new Date('2026-05-19T12:00:00'),
    subtasks: undefined,
    ...p,
  } as Task
}

function backlog(n: number): Task[] {
  return Array.from({ length: n }, (_, i) =>
    task({
      id: `b${i}`,
      title: `backlog ${i}`,
      completed: false,
      bucket: 'inbox',
      scheduledFor: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    })
  )
}

function baseInput(over: Partial<TodayDataInput> = {}): TodayDataInput {
  const viewedDate = over.viewedDate ?? new Date()
  return {
    tasks: [],
    events: [],
    routines: [],
    dateInstances: [],
    viewedDate,
    selectedAssignee: null,
    hideRoutines: false,
    weekStart: sundayOfWeek(viewedDate),
    ...over,
  }
}

const ctxValue = {
  onToggleTask: vi.fn(),
  projects: [], contacts: [], familyMembers: [], lists: [],
}

function renderToday(tasks: Task[]) {
  return render(
    <ScheduleActionsProvider value={ctxValue as never}>
      <TodayView
        tasks={tasks} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={new Date()} onDateChange={vi.fn()}
        projects={[]}
      />
    </ScheduleActionsProvider>
  )
}

describe('Today invariant: the PAGE does not grow with the backlog', () => {
  it('renders the same number of elements at 5 backlog items and at 500', () => {
    // Element count, not markup equality: the attention line's TEXT must
    // differ ("5 need attention" vs "500 need attention") — that is the
    // signal doing its job. What must NOT differ is how much page it takes.
    // Counting every element makes this fail for ANY per-task rendering,
    // wherever it is added and whichever pool it reads from.
    const small = renderToday(backlog(5))
    const smallElements = small.container.querySelectorAll('*').length
    expect(smallElements).toBeGreaterThan(0)
    small.unmount()

    const large = renderToday(backlog(500))
    expect(large.container.querySelectorAll('*').length).toBe(smallElements)
  })

  it('renders no backlog item on the page at all', () => {
    // The count above would also be satisfied by rendering exactly N elements
    // in both cases. This pins the actual rule: backlog is not the day.
    renderToday(backlog(500))
    expect(screen.queryByText('backlog 0')).toBeNull()
    expect(screen.queryByText('backlog 250')).toBeNull()
    expect(screen.queryByText('backlog 499')).toBeNull()
  })

  it('still reports the whole backlog in the one bounded line', () => {
    // The budget is fixed, but nothing is hidden — the line names the size.
    renderToday(backlog(500))
    expect(screen.getByText(/500 need attention/)).toBeInTheDocument()
  })
})

describe('Today invariant: non-commitment space is fixed', () => {
  it('a 5-item backlog and a 500-item backlog produce the same committed rows', () => {
    const now = new Date()
    const small = computeTodayData(baseInput({ tasks: backlog(5), viewedDate: now }))
    const large = computeTodayData(baseInput({ tasks: backlog(500), viewedDate: now }))
    expect(large.counts.totalItems).toBe(small.counts.totalItems)
    expect(large.counts.actionableCount).toBe(small.counts.actionableCount)
  })

  it('neither day is reported as busy — backlog is not the day', () => {
    expect(computeTodayData(baseInput({ tasks: backlog(500), viewedDate: new Date() })).counts.totalItems).toBe(0)
  })

  it('backlog reaches the attention set and never the timeline', () => {
    const large = computeTodayData(baseInput({ tasks: backlog(500), viewedDate: new Date() }))
    expect(large.attentionItems.length).toBeGreaterThan(0)
    // 500 backlog items must reach the attention set and NOTHING else.
    // Inspect contents, not just presence: a pool fed into buildGroupedSections
    // would land here even if the separate counts formula stayed untouched —
    // which is the drift countRoutineUnits was built to prevent.
    expect(Object.values(large.grouped).flat()).toHaveLength(0)
  })
})
