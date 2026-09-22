import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ReferenceListsProvider, useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { TodayView } from './TodayView'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'

/**
 * Today spends ONE line on the day's plan (dayPlan.ts): what waits in the
 * Today pin, and the way back to it. Closing the pin can never make a dated
 * obligation disappear from Today (Scott, 2026-09-19).
 */
const mobile = vi.hoisted(() => ({ value: true }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mobile.value }))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({ setPlanned: vi.fn(async () => true), reschedule: vi.fn(async () => null), getInstancesForRange: vi.fn(async () => []) }),
}))
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
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: ALL_LAYERS, setDomain: vi.fn() }) }
})
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))


const TODAY = new Date()
const midnight = new Date(TODAY); midnight.setHours(0, 0, 0, 0)

const ctxValue = { onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

const datedOnly = createMockTask({ id: 'meds', title: 'Pick up foot meds', bucket: 'timed', isAllDay: true, scheduledFor: midnight })
const chosen = createMockTask({ id: 'bank', title: 'Call the bank', bucket: 'timed', isAllDay: true, scheduledFor: midnight, plannedOn: midnight })
const chore = createMockRoutine({ id: 'r1', name: 'Kids clean rooms', time_of_day: null, recurrence_pattern: { type: 'daily' } })

function PinsProbe() {
  const ref = useReferenceLists()
  return <p data-testid="pins">{ref?.pins.map((p) => p.kind).join(',')}</p>
}

function renderView(props: Record<string, unknown> = {}) {
  const onToggleTask = vi.fn()
  const view = render(
    <ReferenceListsProvider userId="u1">
      <ScheduleActionsProvider value={ctxValue as never}>
        <TodayView
          tasks={[datedOnly, chosen]} events={[]} routines={[chore]} dateInstances={[]}
          selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={onToggleTask}
          onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
          viewedDate={TODAY} onDateChange={vi.fn()}
          projects={[]} {...props}
        />
        <PinsProbe />
      </ScheduleActionsProvider>
    </ReferenceListsProvider>,
  )
  return { ...view, onToggleTask }
}

beforeEach(() => { sessionStorage.clear(); mobile.value = true })

describe('Today — the way to Planning', () => {
  // Scott, 2026-09-21: Today shows what you scheduled for today plus what you
  // chose. A dated task is on the page without being chosen again; the
  // flexible chore still waits in Planning until it is chosen.
  it('the main list shows the chosen task AND the dated-only task; the chore waits in Planning', () => {
    renderView()
    expect(screen.getByText('Call the bank')).toBeInTheDocument()
    expect(screen.getByText('Pick up foot meds')).toBeInTheDocument()
    expect(screen.queryByText('Kids clean rooms')).not.toBeInTheDocument()
    // No instruction beside the heading, and no count — Today keeps no
    // scoreboard and explains nothing (2026-09-21).
    expect(screen.queryByRole('button', { name: /Choose something for today/ })).toBeNull()
    expect(screen.queryByText(/in Planning/)).toBeNull()
    expect(screen.queryByText(/\d scheduled for today/)).toBeNull()
  })

  it('on a phone the "For today" heading\'s Choose button opens the sheet with the same plan, titled "Reference"', () => {
    const { onToggleTask } = renderView()
    const line = screen.getByRole('button', { name: 'Shelves' })
    expect(line).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(line)
    const sheet = screen.getByRole('dialog', { name: 'Shelves' })
    expect(within(sheet).getByRole('heading', { name: 'Shelves' })).toBeInTheDocument()
    const panel = within(sheet).getByTestId('day-plan-panel')
    // The dated task is on the page, not in the sheet; the chore waits here.
    expect(within(panel).queryByText('Pick up foot meds')).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('navigation', { name: 'Shelf source' }).querySelector('button:last-child')!)
    expect(within(panel).getByText('Kids clean rooms')).toBeInTheDocument()
    // Touch layout: no drag handles, every action is a button.
    expect(panel.querySelector('[draggable="true"]')).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Choose Kids clean rooms for today' })).toBeInTheDocument()
    expect(onToggleTask).not.toHaveBeenCalled()
    // The same button closes it.
    fireEvent.click(within(screen.getByRole('region', { name: 'For today' })).getByRole('button', { name: 'Close shelves' }))
    expect(screen.getByRole('button', { name: 'Shelves' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('on desktop the "For today" heading\'s Choose button pins the chooser beside the page and unpins it again; no second prompt', () => {
    mobile.value = false
    renderView()
    expect(screen.getByTestId('pins')).toHaveTextContent('')
    expect(screen.queryByRole('button', { name: /Choose something for today/ })).toBeNull()
    const choose = screen.getByRole('button', { name: 'Shelves' })
    expect(choose).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(choose)
    expect(screen.getByTestId('pins')).toHaveTextContent('today')
    fireEvent.click(within(screen.getByRole('region', { name: 'For today' })).getByRole('button', { name: 'Close shelves' }))
    expect(screen.getByTestId('pins')).toHaveTextContent('')
    expect(ctxValue.onUpdateTask).not.toHaveBeenCalled()
  })
})
