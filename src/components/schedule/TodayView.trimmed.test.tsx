// "Today, trimmed" (spec 2026-10-14): the header sentence, the bar's walk
// (Plan my day / Review my day), and a pending change card drawn dashed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { ALL_LAYERS } from '@/lib/domains'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ConversationWalkContext, type ConversationWalk } from '@/components/canvas/conversationWalk'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import { TodayView } from './TodayView'

const m = vi.hoisted(() => ({
  changeSet: null as ChangeSet | null,
  captures: [] as { id: string; subject: string | null; sourceLabel: string | null; createdAt: Date }[],
  markReviewed: vi.fn(),
  openAssistant: vi.fn(),
  mobile: true,
  discussionRows: [] as unknown[],
}))

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => m.mobile }))
vi.mock('@/hooks/useDiscussionInbox', () => ({ useDiscussionInbox: () => ({ rows: m.discussionRows, unreadCount: 0, waitingCount: 0, loading: false, reload: vi.fn() }) }))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [], loading: false, error: null, getCurrentUserMember: () => ({ id: 'me', name: 'Scott' }) }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({ isPinned: () => false, pin: vi.fn(), unpin: vi.fn() }) }))
vi.mock('@/components/home/week/useWeekInstances', () => ({ useWeekInstances: () => [] }))
vi.mock('@/hooks/useActionQueue', () => ({ useActionQueue: () => ({ actions: [], loading: false, approveAction: vi.fn(), rejectAction: vi.fn(), pendingCount: 0, refetch: vi.fn() }) }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: ALL_LAYERS, setDomain: vi.fn() }) }
})
vi.mock('@/hooks/useUnreviewedCaptures', () => ({
  useUnreviewedCaptures: () => ({ captures: m.captures, loading: false, markReviewed: m.markReviewed, refresh: vi.fn() }),
}))
vi.mock('@/contexts/AssistantLaunchContext', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useAssistantLauncher: () => ({ openAssistant: m.openAssistant }) }
})
vi.mock('@/contexts/CanvasActivityContext', async (importOriginal) => {
  const actual = await importOriginal() as { useCanvasActivity: () => Record<string, unknown> }
  return { ...actual, useCanvasActivity: () => ({ ...actual.useCanvasActivity(), changeSet: m.changeSet }) }
})

const ctxValue = {
  onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [],
  parserContext: { projects: [], contacts: [], familyMembers: [] },
  resolverContext: { contacts: [], aliases: [] },
  getRecentTaskForContact: () => null,
}

// Wednesday 14 October 2026.
const DAY = new Date(2026, 9, 14)
const at = (h: number, min = 0) => new Date(2026, 9, 14, h, min)
const ymd = '2026-10-14'
const untimed = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, completed: false, createdAt: DAY, updatedAt: DAY, bucket: 'timed' as const, scheduledFor: DAY, isAllDay: true, ...extra,
})
const timed = (id: string, title: string, when: Date) => ({
  id, title, completed: false, createdAt: DAY, updatedAt: DAY, bucket: 'timed' as const, scheduledFor: when, isAllDay: false,
})

function renderView(props: Record<string, unknown> = {}, walkSink?: (w: ConversationWalk | null) => void) {
  const view = (
    <ScheduleActionsProvider value={ctxValue as never}>
      <TodayView
        tasks={[]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={DAY} onDateChange={vi.fn()} projects={[]} {...props}
      />
    </ScheduleActionsProvider>
  )
  return render(walkSink ? <ConversationWalkContext.Provider value={walkSink}>{view}</ConversationWalkContext.Provider> : view)
}

const setClock = (d: Date) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(d) }

beforeEach(() => {
  m.changeSet = null
  m.captures = []
  m.markReviewed.mockReset()
  m.openAssistant.mockReset()
  m.mobile = true
  m.discussionRows = []
  setClock(at(10))
})
afterEach(() => { vi.useRealTimers() })

describe('Today, trimmed: the header sentence', () => {
  it('describes recorded tasks without free-time claims when no calendar is connected', () => {
    renderView({ tasks: [timed('d', 'Dentist', at(14))] })
    const masthead = screen.getByTestId('masthead-card')
    expect(within(masthead).getByText('Recorded: Dentist at 2.')).toBeInTheDocument()
    expect(document.querySelectorAll('.today-scale-free')).toHaveLength(0)
  })

  it('folds in new email captures; following them asks Symphony what came in and marks them read', () => {
    m.captures = [
      { id: 'c1', subject: 'Field trip', sourceLabel: null, createdAt: DAY },
      { id: 'c2', subject: 'Picture day', sourceLabel: null, createdAt: DAY },
    ]
    renderView()
    fireEvent.click(screen.getByRole('button', { name: '2 new from email.' }))
    expect(m.markReviewed).toHaveBeenCalledWith(['c1', 'c2'])
    expect(m.openAssistant).toHaveBeenCalledWith(expect.objectContaining({
      message: 'What came in from email (“Field trip”, “Picture day”)? Tell me what you added and where it landed.',
      autoSend: true, stayOnPage: true,
    }))
  })

  it('an empty day says nothing up there', () => {
    renderView()
    expect(screen.queryByText(/hours open|new from email|^Next: /)).toBeNull()
  })
})

describe('Today, trimmed: removed controls', () => {
  it('has no review button, bulk checkbox, suggestions, duplicate or proposed-order doors', () => {
    renderView({ tasks: [untimed('a', 'Buy Ella a helmet'), untimed('b', 'Buy Ella a helmet')] })
    for (const name of [/review today/i, /review carried-over/i, /select/i, /suggestions/i, /duplicate/i, /suggested order/i, /new from email$/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('Today, trimmed: the walk', () => {
  it('offers "Plan my day" in the bar before 4 pm', () => {
    const sink = vi.fn()
    renderView({}, sink)
    expect(sink).toHaveBeenLastCalledWith({ label: 'Plan my day', message: 'Plan my day.' })
    // In the bar, not also in the page.
    expect(screen.queryByRole('button', { name: 'Plan my day' })).toBeNull()
  })

  it('offers "Review my day" from 4 pm', () => {
    setClock(at(16))
    const sink = vi.fn()
    renderView({}, sink)
    expect(sink).toHaveBeenLastCalledWith({ label: 'Review my day', message: 'Review my day.' })
  })

  it('offers nothing when another day is in view', () => {
    const sink = vi.fn()
    renderView({ viewedDate: new Date(2026, 9, 15) }, sink)
    expect(sink).not.toHaveBeenCalledWith(expect.objectContaining({ label: expect.any(String) }))
  })

  it('phones (no bar) show it in the page and send the same message', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Plan my day' }))
    expect(m.openAssistant).toHaveBeenCalledWith({ message: 'Plan my day.', autoSend: true })
  })
})

describe('Today, trimmed: a pending change card, dashed', () => {
  const card = (ops: ChangeSet['ops']): ChangeSet => ({ key: 'cs', title: 'Plan my day', ops })

  it('draws arrivals teal: timed on the day scale, untimed in For today', () => {
    m.changeSet = card([
      { key: 'k1', op: 'place', taskId: 'p', title: 'Prep WSWMD interview', date: ymd, time: '11:30' },
      { key: 'k2', op: 'add', title: 'Call the vet', date: ymd },
    ])
    renderView({ tasks: [untimed('p', 'Prep WSWMD interview')] })
    const rows = screen.getAllByTestId('proposed-row')
    expect(rows.map((r) => r.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Call the vet'),
      expect.stringContaining('11:30 · Prep WSWMD interview'),
    ]))
    expect(within(screen.getByTestId('today-day-scale')).getByText('Prep WSWMD interview')).toBeInTheDocument()
    // The task left its untimed spot: it is drawn once, where it would land.
    expect(screen.getAllByText('Prep WSWMD interview')).toHaveLength(1)
  })

  it('marks leaving, done and merged rows on the list with their notes', () => {
    m.changeSet = card([
      { key: 'k1', op: 'place', taskId: 'a', title: 'Submit AF&PA application', date: '2026-10-15' },
      { key: 'k2', op: 'done', taskId: 'b', title: 'Reply to Christian' },
      { key: 'k3', op: 'merge', taskId: 'c', fromTaskId: 'd', title: 'Call Molly about the Buick', fromTitle: 'Call Molly' },
      { key: 'k4', op: 'talk', taskId: 'e', title: 'Coppermine sign-up', note: 'with Iris' },
    ])
    renderView({ tasks: [
      untimed('a', 'Submit AF&PA application'), untimed('b', 'Reply to Christian'),
      untimed('c', 'Call Molly about the Buick'), untimed('d', 'Call Molly'), untimed('e', 'Coppermine sign-up'),
    ] })
    const row = (id: string) => document.querySelector(`[data-item-id="task-${id}"]`)!
    expect(row('a').className).toMatch(/today-preview-row is-leaving is-struck/)
    expect(within(row('a') as HTMLElement).getByText('→ Thu')).toBeInTheDocument()
    expect(row('b').className).toMatch(/is-proposed is-struck/)
    expect(within(row('b') as HTMLElement).getByText('Done')).toBeInTheDocument()
    expect(within(row('c') as HTMLElement).getByText('Merged · 2 into 1')).toBeInTheDocument()
    expect(row('d').className).toMatch(/is-leaving is-struck/)
    expect(within(row('e') as HTMLElement).getByText('→ Talk about')).toBeInTheDocument()
    // And the new talk-about waits, dashed, on the To talk about line.
    expect(within(screen.getByRole('group', { name: 'To talk about' })).getByTestId('proposed-talk')).toHaveTextContent('Coppermine sign-up · with Iris')
  })

  it('draws nothing without a card', () => {
    renderView({ tasks: [untimed('a', 'Buy Ella a helmet')] })
    expect(screen.queryAllByTestId('proposed-row')).toHaveLength(0)
    expect(document.querySelector('.today-preview-row')).toBeNull()
  })
})

describe('Today, trimmed: a discussion waiting on you (discussions v2, board 4)', () => {
  const waiting = {
    sessionId: 's1', entityType: 'task', entityId: 't1', title: 'Summer camp', lastAuthor: 'Iris', lastText: 'Which week works?',
    lastAt: new Date(), unread: true, state: { kind: 'waiting-on-you' }, others: ['Iris'], waitingOn: [], scope: 'couple',
    settledAt: null, settledBy: null, outcome: null,
  }
  it('shows first on desktop, with who, what and Reply', () => {
    m.mobile = false
    m.discussionRows = [waiting]
    renderView()
    const card = screen.getByRole('button', { name: 'Iris is waiting on you about Summer camp' })
    expect(card.textContent).toContain('Which week works?')
    expect(card.textContent).toContain('Reply')
  })
  it('leaves phones to the shell banner', () => {
    m.discussionRows = [waiting]
    renderView()
    expect(screen.queryByRole('button', { name: 'Iris is waiting on you about Summer camp' })).toBeNull()
  })
})
