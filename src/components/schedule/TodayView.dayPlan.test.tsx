import {AlongsideContext, type AlongsideWorkspace} from '@/components/plan/constellation/AlongsideContext'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ReferenceListsProvider, useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { TodayView } from './TodayView'
import { AlongsideDay } from '@/components/plan/constellation/AlongsideDay'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'

/**
 * Today spends ONE line on the day's plan (dayPlan.ts): what waits in the
 * Today pin, and the way back to it. Closing the pin can never make a dated
 * obligation disappear from Today (Scott, 2026-09-19).
 */
const mobile = vi.hoisted(() => ({ value: true }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mobile.value }))
const instances = vi.hoisted(() => ({ setPlanned: null as null | ((...a: unknown[]) => Promise<boolean>) }))
vi.mock('@/hooks/useActionableInstances', async () => {
  const { vi: v } = await import('vitest')
  instances.setPlanned = v.fn(async () => true)
  return { useActionableInstances: () => ({ setPlanned: instances.setPlanned, reschedule: v.fn(async () => null), getInstancesForRange: v.fn(async () => []) }) }
})
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

const ctxValue = { onUpdateRoutine: vi.fn(), onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

const datedOnly = createMockTask({ id: 'meds', title: 'Pick up foot meds', bucket: 'timed', isAllDay: true, scheduledFor: midnight })
const chosen = createMockTask({ id: 'bank', title: 'Call the bank', bucket: 'timed', isAllDay: true, scheduledFor: midnight, plannedOn: midnight })
// Show in Today not positively set (null): a choice, waiting in Planning. One
// switched ON is on Today on its due days (dayPlan.test.ts).
const chore = createMockRoutine({ id: 'r1', name: 'Kids clean rooms', time_of_day: null, recurrence_pattern: { type: 'daily' }, show_on_timeline: null as unknown as boolean })

function PinsProbe() {
  const ref = useReferenceLists()
  return <p data-testid="pins">{ref?.pins.map((p) => p.kind).join(',')}</p>
}

function renderView(props: Record<string, unknown> = {}, workspace: AlongsideWorkspace|null = null) {
  const onToggleTask = vi.fn()
  const view = render(
    <AlongsideContext.Provider value={workspace}><ReferenceListsProvider userId="u1">
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
    </ReferenceListsProvider></AlongsideContext.Provider>,
  )
  return { ...view, onToggleTask }
}

beforeEach(() => { sessionStorage.clear(); localStorage.removeItem('symphony-plan-v2.view.today'); mobile.value = true })

describe('Today — routines off the grid (Scott, 2026-11-09)', () => {
  const timed = (over: Parameters<typeof createMockRoutine>[0]) =>
    createMockRoutine({ time_of_day: '12:00', recurrence_pattern: { type: 'daily' }, show_on_timeline: true, ...over })
  const dayRegion = () => within(screen.getByRole('region', { name: 'The day' }))
  const forToday = () => within(screen.getByRole('region', { name: 'To do' }))

  it('a timed routine is on the checklist, with a quiet band on the grid', () => {
    renderView({ routines: [timed({ id: 'a', name: 'School morning' })] })
    expect(within(forToday().getByRole('list', { name: 'Routines today' })).getByText('School morning')).toBeInTheDocument()
    // On the grid only as the quiet band, which names it (Scott, 2026-11-10).
    expect(dayRegion().queryByRole('button', { name: /^School morning, / })).toBeNull()
    expect(document.querySelector('.today-scale-quiet')).toHaveTextContent('School morning')
  })

  it('a pinned routine is on the grid and not the checklist', () => {
    renderView({ routines: [timed({ id: 'b', name: 'The dose', show_on_day_grid: true })] })
    expect(dayRegion().getByRole('button', { name: /^The dose, / })).toBeInTheDocument()
    expect(forToday().queryByText('The dose')).toBeNull()
  })

  it('a Background routine has no checklist row; its band names it and opens it, with no pin', () => {
    renderView({ routines: [timed({ id: 'c', name: 'FFG pickup', background: true })] })
    expect(forToday().queryByText(/FFG pickup/)).toBeNull()
    fireEvent.click(dayRegion().getByRole('button', { name: /^Routines at .*FFG pickup/ }))
    const pop = screen.getByRole('dialog', { name: /^Routines at / })
    expect(within(pop).getByRole('button', { name: /^FFG pickup, / })).toBeInTheDocument()
    expect(within(pop).queryByRole('button', { name: 'Keep FFG pickup on the grid' })).toBeNull()
  })

  it('a band opens its routines: tick one off, or keep it on the grid', async () => {
    ctxValue.onUpdateRoutine.mockClear()
    const onCompleteRoutine = vi.fn()
    renderView({ routines: [timed({ id: 'a', name: 'School morning' })], onCompleteRoutine })
    fireEvent.click(dayRegion().getByRole('button', { name: /^Routines at .*School morning/ }))
    const pop = screen.getByRole('dialog', { name: /^Routines at / })
    fireEvent.click(within(pop).getByRole('button', { name: 'Mark School morning complete' }))
    expect(onCompleteRoutine).toHaveBeenCalledWith('a', true)
    fireEvent.click(within(pop).getByRole('button', { name: 'Keep School morning on the grid' }))
    await waitFor(() => expect(ctxValue.onUpdateRoutine).toHaveBeenCalledWith('a', { show_on_day_grid: true }))
  })

  it('the pin on a checklist row saves it to the grid', async () => {
    ctxValue.onUpdateRoutine.mockClear()
    renderView({ routines: [timed({ id: 'a', name: 'School morning' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Keep School morning on the grid' }))
    await waitFor(() => expect(ctxValue.onUpdateRoutine).toHaveBeenCalledWith('a', { show_on_day_grid: true }))
  })
})

describe('Today — the way to Planning', () => {
  // Scott, 2026-09-21: Today shows what you scheduled for today plus what you
  // chose. A dated task is on the page without being chosen again; the
  // flexible chore still waits in Planning until it is chosen.
  it('the main list shows the chosen task AND the dated-only task; the chore waits in Planning', () => {
    renderView()
    expect(screen.getByText('Call the bank')).toBeInTheDocument()
    expect(screen.getByText('Pick up foot meds')).toBeInTheDocument()
    // (Off the day's list; it waits on the week sheet beside it.)
    expect(within(screen.getByRole('region', { name: 'To do' })).queryByText('Kids clean rooms')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'The day' })).queryByText('Kids clean rooms')).not.toBeInTheDocument()
    // No instruction beside the heading, and no count — Today keeps no
    // scoreboard and explains nothing (2026-09-21).
    expect(screen.queryByRole('button', { name: /Choose something for today/ })).toBeNull()
    expect(screen.queryByText(/in Planning/)).toBeNull()
    expect(screen.queryByText(/\d scheduled for today/)).toBeNull()
  })

  // Paper-style horizons (Scott, 2026-11-04): the week folds beside the day
  // like every other horizon, in place of the This week column and its view
  // icons. Its rows keep their + (week and day share items).
  it('the week is folded beside the day: an edge, no column, no view icons, no Shelves drawer', () => {
    const { onToggleTask } = renderView()
    expect(screen.queryByRole('button', { name: 'Shelves' })).toBeNull()
    expect(screen.queryByRole('region', { name: /for reference$/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull()
    expect(document.querySelector('.today-aside')).toBeNull()
    const edge = screen.getByRole('button', { name: /^\w{3} \d+ – \w{3} \d+, \d+ open\. Unfold to read$/ })
    expect(edge).toHaveAttribute('aria-expanded', 'false')
    // The day sits on the fold's own sheet.
    expect(document.querySelector('.paper-fold[data-horizon="day"] > article.paper-fold-current')).toContainElement(screen.getByText('Call the bank'))
    fireEvent.click(edge)
    expect(screen.getByText('Pick three to five for today.')).toBeInTheDocument()
    expect(onToggleTask).not.toHaveBeenCalled()
    // The sheet replaces the dock's Today pin — never both.
    expect(screen.getByTestId('pins')).toHaveTextContent('')
    expect(ctxValue.onUpdateTask).not.toHaveBeenCalled()
  })

  // Fix round 1 (2026-11-04): a flexible routine with no time is kept off the
  // day's list (dayPlan's offMainRoutineItemIds); its home was the column's
  // "Routines today". It is on the week sheet now, below the week's tasks,
  // with the same + the column had.
  it('a flexible untimed routine is on the sheet under Routines to pick from, and + plans it for today', async () => {
    localStorage.setItem('symphony-fold:day', 'open')
    try {
      renderView()
      const sheet = screen.getByRole('region', { name: /, to pick from$/ })
      const routines = within(sheet).getByRole('list', { name: 'Routines to pick from' })
      expect(within(routines).getByText('Kids clean rooms')).toBeInTheDocument()
      expect(within(routines).getByText('Kids clean rooms').closest('li')).toHaveAttribute('draggable', 'true')
      fireEvent.click(within(routines).getByRole('button', { name: 'Plan Kids clean rooms for today' }))
      await waitFor(() => expect(instances.setPlanned).toHaveBeenCalledWith('routine', 'r1', expect.any(Date), true))
    } finally {
      localStorage.removeItem('symphony-fold:day')
    }
  })

  // Fix round 2 (ruling 2026-11-04): the live /today is the connected
  // workspace. Its sheet (AlongsideDay) carries the same Routines today, drawn
  // by TodayView from the day's plan with the same +.
  it('in the connected workspace, a flexible untimed routine is on the sheet and + plans it for today', async () => {
    localStorage.setItem('symphony-fold:day', 'open')
    try {
      render(
        <ReferenceListsProvider userId="u1">
          <ScheduleActionsProvider value={ctxValue as never}>
            <AlongsideDay tasks={[datedOnly, chosen]} date={TODAY} update={vi.fn()} loading={false} error={false} retry={vi.fn()}>
              <TodayView
                tasks={[datedOnly, chosen]} events={[]} routines={[chore]} dateInstances={[]}
                selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
                onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
                viewedDate={TODAY} onDateChange={vi.fn()} projects={[]}
              />
            </AlongsideDay>
          </ScheduleActionsProvider>
        </ReferenceListsProvider>,
      )
      // One fold: the workspace's.
      expect(document.querySelectorAll('.paper-fold')).toHaveLength(1)
      const sheet = screen.getByRole('region', { name: /, to pick from$/ })
      const routines = await within(sheet).findByRole('list', { name: 'Routines to pick from' })
      expect(within(routines).getByText('Kids clean rooms').closest('li')).toHaveAttribute('draggable', 'true')
      // Below the week's tasks, above the foot.
      expect(routines.compareDocumentPosition(within(sheet).getByText('Pick three to five for today.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      fireEvent.click(within(routines).getByRole('button', { name: 'Plan Kids clean rooms for today' }))
      await waitFor(() => expect(instances.setPlanned).toHaveBeenCalledWith('routine', 'r1', expect.any(Date), true))
    } finally {
      localStorage.removeItem('symphony-fold:day')
    }
  })

  it('the day is the fold’s sheet on the desk too, with no split columns', () => {
    mobile.value = false
    renderView()
    expect(document.querySelector('.today-split')).toBeNull()
    expect(document.querySelector('.paper-fold[data-horizon="day"]')).not.toBeNull()
  })
})

 it('inside the connected workspace, draws no view switch and no fold of its own (AlongsideDay folds the week)',()=>{
   renderView({}, {weekFolded:true, routinesSlot:null, driveWeek:()=>{}, listenPlaced:()=>()=>{}})
   expect(screen.queryByRole('group',{name:'View'})).not.toBeInTheDocument()
   expect(document.querySelector('.paper-fold')).toBeNull()
   expect(screen.getByText('Call the bank')).toBeInTheDocument()
 })
