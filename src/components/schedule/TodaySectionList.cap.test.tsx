import { describe, it, expect, vi } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'
import { DEFAULT_SECTION_CAP } from '@/lib/today/pageCap'

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
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: ALL_LAYERS, setDomain: vi.fn() }) }
})
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

const TODAY = new Date()

const ctxValue = {
  onToggleTask: vi.fn(),
  projects: [], contacts: [], familyMembers: [], lists: [],
}

/** N incomplete all-day tasks on the viewed day. */
function allDayTasks(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(TODAY)
    d.setHours(0, 0, 0, 0)
    return {
      id: `t${i}`,
      title: `Capped task ${String(i).padStart(2, '0')}`,
      completed: false,
      bucket: 'timed' as const,
      isAllDay: true,
      scheduledFor: d,
      createdAt: new Date(2026, 0, 1, 0, 0, i),
      updatedAt: new Date(2026, 0, 1, 0, 0, i),
      sortOrder: i * 1000,
    }
  })
}

function renderView(props: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={ctxValue as never}>
      <TodayView
        tasks={[]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={TODAY} onDateChange={vi.fn()}
        projects={[]} {...props}
      />
    </ScheduleActionsProvider>
  )
}

describe('Today page cap', () => {
  const TOTAL = DEFAULT_SECTION_CAP + 12

  it('renders only the cap, and says how many it is holding back', async () => {
    renderView({ tasks: allDayTasks(TOTAL) as never })
    const rows = await screen.findAllByText(/^Capped task \d+$/)
    expect(rows).toHaveLength(DEFAULT_SECTION_CAP)
    expect(screen.getByRole('button', { name: `+${TOTAL - DEFAULT_SECTION_CAP} more today` })).toBeInTheDocument()
  })

  it('renders no section header in the flat agenda — the +N control carries the truth', async () => {
    // Timed sections lost their everyday headers in the flat-agenda change
    // (2026-08-18); they reappear only as drag-target labels, and DaySectionHeader
    // still receives the FULL items.length when it does (its own tests pin the
    // count display). Day-to-day, the honest count lives on the "+N more today"
    // control asserted above — a cap that hides its own truncation is worse
    // than a long page.
    renderView({ tasks: allDayTasks(TOTAL) as never })
    await screen.findAllByText(/^Capped task \d+$/)
    expect(screen.queryByRole('button', { name: /collapse all day/i })).not.toBeInTheDocument()
  })

  it('expanding reveals the rest and retires the control', async () => {
    const { user } = renderView({ tasks: allDayTasks(TOTAL) as never })
    await screen.findAllByText(/^Capped task \d+$/)
    await user.click(screen.getByRole('button', { name: `+${TOTAL - DEFAULT_SECTION_CAP} more today` }))
    expect(await screen.findAllByText(/^Capped task \d+$/)).toHaveLength(TOTAL)
    expect(screen.queryByRole('button', { name: /more today/i })).not.toBeInTheDocument()
  })

  it('does not cap a section that fits', async () => {
    renderView({ tasks: allDayTasks(3) as never })
    expect(await screen.findAllByText(/^Capped task \d+$/)).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /more today/i })).not.toBeInTheDocument()
  })
})
