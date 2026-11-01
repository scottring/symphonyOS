import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { deckModeOf } from '@/lib/planning/deck'
import { createMockTask, createMockRoutine } from '@/test/mocks/factories'
import type { RecurrencePattern } from '@/types/actionable'
import { GuidedSessionProvider, useGuidedSession, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'

// The person's notes row for the week, in memory: what usePlanningNotes reads
// and patch merges into (the real merge is usePlanningNotes' own test).
const store = vi.hoisted(() => ({ notes: {} as Record<string, unknown>, patches: [] as { p: Record<string, unknown>; defaults?: Record<string, unknown> }[], order: [] as string[], fail: false }))
vi.mock('@/hooks/usePlanningNotes', async () => {
  const { useState, useCallback } = await import('react')
  return {
    usePlanningNotes: () => {
      const [notes, setNotes] = useState(store.notes)
      const patch = useCallback(async (p: Record<string, unknown>, defaults?: Record<string, unknown>) => {
        if (store.fail) return false
        store.patches.push({ p, defaults })
        if ((p.guide as { finishedAt?: string } | undefined)?.finishedAt) store.order.push('finished')
        store.notes = { ...defaults, ...store.notes, ...p }
        setNotes(store.notes)
        return true
      }, [])
      return { notes, loading: false, error: null, patch, reload: () => undefined }
    },
  }
})
const session = vi.hoisted(() => ({ saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn(async () => true) }))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => session,
  weekToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
}))
const review = vi.hoisted(() => ({ reviewed: null, mine: null, loading: false, error: null, reload: vi.fn(), finish: vi.fn(async () => true) }))
vi.mock('@/hooks/usePeriodReview', () => ({ usePeriodReview: () => review }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ changeSet: null, receipt: null }) }))
vi.mock('@/hooks/usePlannedDinners', () => ({ usePlannedDinners: () => new Map([['2026-09-28', { dateKey: '2026-09-28', title: 'Tacos' }]]) }))
const wall = vi.hoisted(() => ({ add: vi.fn(async (..._a: unknown[]) => true) }))
vi.mock('@/lib/wall/addScratchpadNote', () => ({ addScratchpadNote: wall.add, ownMemberId: async () => 'member-me' }))

import { WeekV2, type WeekDeck } from '@/components/plan/v2/WeekV2'
import { useGuidedWeek } from './useGuidedWeek'
import type { WeekChoose } from '@/components/home/week/useChooseWeek'

const weekStart = new Date(2026, 8, 27) // Sunday
const onWeek = (id: string, extra = {}) => createMockTask({ id, title: id, bucket: 'week', weekStart, commitments: [{ level: 'week', periodStart: weekStart, status: 'open' }], ...extra })

const verb = (ok = true) => ({ label: 'This week', role: 'here' as const, run: vi.fn(async () => ok) })
const makeChoose = (over: Partial<WeekChoose> = {}): WeekChoose => ({
  monthWord: 'October', notDoneLastWeek: 0,
  lines: [{ key: 'L', title: 'Get the house ready', planned: { kind: 'above', label: 'October' }, counts: '', verbs: [verb()], steps: [] }] as unknown as WeekChoose['lines'],
  doneLines: [], loose: [], onAddLoose: vi.fn(async () => true), placeItems: [], placedCount: 0,
  ...over,
})
const makeDeck = (over: Partial<WeekDeck> = {}): WeekDeck => ({
  mode: null, available: true, cards: [], doneLastWeek: 0, aged: 0, stripDays: [], onSeeAged: vi.fn(),
  onFinish: vi.fn(async () => { store.order.push('drain'); return true }),
  actions: { done: vi.fn(), placeOnDay: vi.fn(), keepThisWeek: vi.fn(async () => true), later: vi.fn(), laterOnDate: vi.fn(), letGo: vi.fn(), drain: vi.fn() } as unknown as WeekDeck['actions'],
  choose: makeChoose(), tasks: [],
  ...over,
})

// The shell's side, standing in: the registered header, shown as the shell
// shows it above the conversation.
const shell = { reg: null as GuidedSessionRegistration | null }
function Shell() {
  const reg = useGuidedSession()
  useEffect(() => { shell.reg = reg })
  return reg ? <div data-testid="guide-panel">{reg.header}</div> : null
}
function Where() { return <output data-testid="where">{useLocation().search}</output> }
const where = () => new URLSearchParams(screen.getByTestId('where').textContent ?? '')
function WithDeck({ deck, canvas }: { deck: WeekDeck; canvas: (o?: { hideStrip?: boolean }) => ReactNode }) {
  const [params] = useSearchParams()
  return <WeekV2 weekStart={weekStart} isCurrent canvas={canvas} deck={{ ...deck, mode: deckModeOf(params) }} />
}
const canvas = vi.fn((o?: { hideStrip?: boolean }) => <section aria-label="The days">{o?.hideStrip ? 'days without the strip' : 'days with the strip'}</section>)
const open = (url: string, deck = makeDeck()) => render(
  <MemoryRouter initialEntries={[url]}>
    <GuidedSessionProvider>
      <WithDeck deck={deck} canvas={canvas} />
      <Shell />
      <Where />
    </GuidedSessionProvider>
  </MemoryRouter>,
)
const panel = () => within(screen.getByTestId('guide-panel'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 12)) // Tuesday
  store.notes = {}; store.patches = []; store.order = []; store.fail = false
  shell.reg = null
  wall.add.mockClear(); session.reload.mockClear()
  canvas.mockClear()
  session.save.mockReset(); session.save.mockImplementation(async () => { store.order.push('planned'); return true })
  review.finish.mockReset(); review.finish.mockImplementation(async () => { store.order.push('review'); return true })
})
afterEach(() => { vi.useRealTimers() })

describe('GuidedWeek — the Week page while planning', () => {
  it('?plan=1 opens the session on the page: the session bar, the rail, and the week without its strip', () => {
    open('/week?plan=1')
    const session = screen.getByRole('region', { name: 'Planning the week' })
    expect(within(session).getByText(/Planning the week · step 1 of 7 ·/)).toBeInTheDocument()
    expect(within(session).getByRole('group', { name: 'Steps in this session' })).toBeInTheDocument()
    expect(within(session).getByRole('button', { name: /Read October/ })).toBeInTheDocument()
    expect(within(session).getByText('days without the strip')).toBeInTheDocument()
    expect(canvas).toHaveBeenLastCalledWith({ hideStrip: true })
    // The step's header is the conversation's, not the page's.
    expect(within(session).queryByRole('button', { name: 'Next step' })).toBeNull()
    expect(panel().getByText('Look back at last week')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'week', token: '2026-9-27', threadKey: 'weekly:2026-9-27', stepId: 'look-back' })
  })

  it('resuming opens on the saved step, and the registration carries it', () => {
    store.notes = { guide: { current: 'inbox', done: ['look-back', 'read-month', 'calendar'], skipped: [], threadId: 't1' } }
    open('/week?plan=1')
    expect(screen.getByText(/Planning the week · step 4 of 7/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear the inbox/ })).toHaveAttribute('aria-current', 'step')
    expect(panel().getByText('Clear the inbox')).toBeInTheDocument()
    expect(shell.reg?.stepId).toBe('inbox')
    expect(shell.reg?.threadId).toBe('t1')
    expect(shell.reg?.sessionContext.guide).toMatchObject({ stepId: 'inbox', writes: ['inbox'], aboveLines: [{ id: 'L', title: 'Get the house ready' }] })
  })

  it('Next step moves the registration on; tapping a step and going there jumps', async () => {
    open('/week?plan=1')
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(shell.reg?.stepId).toBe('read-month')
    expect(panel().getByText('Read October')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Choose this week/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to this step' })) })
    expect(shell.reg?.stepId).toBe('choose')
  })

  it('the first four steps show their bodies inside the rail, from the page’s own lists', async () => {
    const gate = { key: 'gate', title: 'Fix the gate', who: [], canHandOff: true, thisWeek: vi.fn(async () => true), smaller: vi.fn(async () => true), handOff: vi.fn(async () => true), drop: vi.fn(async () => true), done: vi.fn(async () => true) }
    const vet = createMockTask({ id: 'vet', title: 'Book the vet', bucket: 'inbox' })
    const deck = makeDeck({
      aged: 2, doneLastWeek: 3, plannedLastWeek: 4,
      choose: makeChoose({ notDoneLastWeek: 1, looseEnds: [gate] }),
      cards: [{ key: 'vet', task: vet, source: 'inbox', facts: 'Captured Monday' }],
      events: [{ id: 'e1', title: 'Dentist', start: new Date(2026, 8, 28, 9), end: new Date(2026, 8, 28, 10) }, { id: 'e2', title: 'Team call', start: new Date(2026, 8, 28, 9, 30), end: new Date(2026, 8, 28, 11) }],
    })
    open('/week?plan=1', deck)
    const rail = () => within(screen.getByRole('group', { name: 'Steps in this session' }))
    // 1 · Look back: the notes save as last week's review; the loose end and the sweep's note.
    fireEvent.change(rail().getByLabelText('What went well'), { target: { value: 'Rested' } })
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Save notes' })) })
    expect(review.finish).toHaveBeenCalledWith({ wentWell: 'Rested', didnt: '' })
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Drop: Fix the gate' })) })
    expect(gate.drop).toHaveBeenCalled()
    expect(rail().getByText(/Moved 2 untouched things to Later/)).toBeInTheDocument()
    // 2 · Read October: the month's lines.
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(rail().getByRole('listitem', { name: 'Get the house ready' })).toBeInTheDocument()
    // 3 · Calendar check: the clash, flagged on its day.
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(rail().getByText('Overlap: Dentist and Team call')).toBeInTheDocument()
    // 4 · Clear the inbox: filed through the deck's writers.
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'This week: Book the vet' })) })
    expect(deck.actions.keepThisWeek).toHaveBeenCalledWith(deck.cards[0])
  })

  it('the last three steps show their bodies: choose with the count, weekly ops, tell the family', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [] } }
    const dog = createMockRoutine({ id: 'dog', name: 'Walk the dog', time_of_day: '07:00:00', recurrence_pattern: { type: 'daily' } as RecurrencePattern })
    const deck = makeDeck({
      tasks: [onWeek('a'), onWeek('gate', { title: 'Fix the gate', context: 'family' }), onWeek('board', { title: 'Board deck', context: 'work' })],
      routines: [dog],
    })
    open('/week?plan=1', deck)
    const rail = () => within(screen.getByRole('group', { name: 'Steps in this session' }))
    // 5 · Choose: the session's count (the same as the bar's), and a choice
    // that saves marks the week planned.
    expect(rail().getByText('That’s 3 of about 15.')).toBeInTheDocument()
    expect(screen.getByText('3 of about 15 on this week')).toBeInTheDocument()
    fireEvent.click(rail().getByRole('button', { name: /Get the house ready/ }))
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'This week: Get the house ready' })) })
    expect(deck.choose.lines[0].verbs[0].run).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(store.patches.filter((x) => (x.p.guide as { plannedAt?: string } | undefined)?.plannedAt)).toHaveLength(1))
    // 6 · Weekly ops: dinners, routines, the weekend note on the same row.
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(rail().getByText('Tacos')).toBeInTheDocument()
    expect(rail().getByRole('link', { name: 'Open the meal plan' })).toHaveAttribute('href', '/meals/plan?week=2026-09-27')
    expect(rail().getByText('7a Walk the dog')).toBeInTheDocument()
    fireEvent.change(rail().getByLabelText('What the weekend is for'), { target: { value: 'The lake' } })
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Save weekend note' })) })
    expect(store.patches.at(-1)?.p).toEqual({ weekend: 'The lake' })
    expect(store.notes.weekend).toBe('The lake')
    // 7 · Tell the family: the week's Family items for reference; only what
    // is typed is posted, kept until the week is over.
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(rail().getByRole('list', { name: 'This week’s Family items' })).toHaveTextContent('Fix the gate')
    expect(rail().queryByText('Board deck')).toBeNull()
    fireEvent.change(rail().getByLabelText('What should the family know?'), { target: { value: 'Grandma Thursday' } })
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Post to the wall' })) })
    expect(wall.add).toHaveBeenCalledWith('me', 'Grandma Thursday', 'note', 'member-me', new Date(2026, 9, 4))
    expect(rail().getByRole('status')).toHaveTextContent('Posted 1 note')
  })

  it('a write saved on the page itself marks the week planned on the choosing step, and only there', async () => {
    store.notes = { guide: { current: 'inbox', done: [], skipped: [] } }
    const listening = { fn: null as null | (() => void) }
    const stop = vi.fn()
    const deck = makeDeck({ listenCanvasWrites: (fn) => { listening.fn = fn; return stop } })
    const view = open('/week?plan=1', deck)
    const plannedPatches = () => store.patches.filter((x) => (x.p.guide as { plannedAt?: string } | undefined)?.plannedAt)
    // Dragged onto a day while clearing the inbox: not planned.
    await act(async () => { listening.fn?.() })
    expect(plannedPatches()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Choose this week/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to this step' })) })
    await act(async () => { listening.fn?.() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    expect(session.reload).toHaveBeenCalled()
    // Once per session.
    await act(async () => { listening.fn?.() })
    expect(plannedPatches()).toHaveLength(1)
    // Leaving the session stops listening.
    view.unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('notes typed in Look back and not saved survive going on and coming back, marked not saved', async () => {
    open('/week?plan=1')
    const rail = () => within(screen.getByRole('group', { name: 'Steps in this session' }))
    fireEvent.change(rail().getByLabelText('What went well'), { target: { value: 'Rested' } })
    expect(rail().getByText('Not saved yet')).toBeInTheDocument()
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(rail().queryByLabelText('What went well')).toBeNull()
    fireEvent.click(rail().getByRole('button', { name: /Look back at last week/ }))
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Go to this step' })) })
    expect(rail().getByLabelText('What went well')).toHaveValue('Rested')
    expect(rail().getByText('Not saved yet')).toBeInTheDocument()
    expect(review.finish).not.toHaveBeenCalled()
  })

  it('the count reads "{n} of about 15": what is on this week, from the page’s own list', () => {
    const tasks = [onWeek('a'), onWeek('b', { completed: true }), createMockTask({ id: 'given', scheduledFor: new Date(2026, 8, 30), isAllDay: true }), createMockTask({ id: 'inbox', bucket: 'inbox' })]
    open('/week?plan=1', makeDeck({ tasks }))
    expect(screen.getByText('3 of about 15 on this week')).toBeInTheDocument()
    expect(shell.reg?.sessionContext.guide.counts).toEqual({ label: 'tasks on this week', n: 3, of: 'about 15' })
  })

  it('"Done planning the week" runs the week’s closing writes, then finishes the session, then closes it', async () => {
    store.notes = { guide: { current: 'family', done: [], skipped: [] } }
    const deck = makeDeck()
    open('/week?plan=1', deck)
    expect(panel().queryByRole('button', { name: 'Next step' })).toBeNull()
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Done planning the week' })) })
    await waitFor(() => expect(where().get('plan')).toBeNull())
    expect(store.order).toEqual(['drain', 'review', 'planned', 'finished'])
    expect((store.notes.guide as { finishedAt?: string }).finishedAt).toEqual(expect.any(String))
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(screen.getByText('days with the strip')).toBeInTheDocument()
    expect(shell.reg).toBeNull()
  })

  it('a failed drain keeps the session open and finishes nothing', async () => {
    store.notes = { guide: { current: 'family', done: [], skipped: [] } }
    open('/week?plan=1', makeDeck({ onFinish: vi.fn(async () => false) }))
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Done planning the week' })) })
    expect(where().get('plan')).toBe('1')
    expect(review.finish).not.toHaveBeenCalled()
    expect(store.patches.some((x) => (x.p.guide as { finishedAt?: string }).finishedAt)).toBe(false)
  })

  it('Leave closes without finishing and keeps where the session is', async () => {
    store.notes = { guide: { current: 'calendar', done: ['look-back'], skipped: ['read-month'] } }
    const deck = makeDeck()
    open('/week?plan=1', deck)
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(where().get('plan')).toBeNull()
    expect(screen.getByText('days with the strip')).toBeInTheDocument()
    expect(deck.onFinish).not.toHaveBeenCalled()
    expect(review.finish).not.toHaveBeenCalled()
    expect(store.patches).toEqual([])
    expect(store.notes.guide).toEqual({ current: 'calendar', done: ['look-back'], skipped: ['read-month'] })
  })

  it('?place=1 opens Give them a day on its own, with no session', () => {
    open('/week?place=1')
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(shell.reg).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(where().get('place')).toBeNull()
  })
})

describe('useGuidedWeek — planned once something is applied at Choose', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter><GuidedSessionProvider>{children}</GuidedSessionProvider></MemoryRouter>
  const hook = (choose: WeekChoose, onPlanned = vi.fn()) => renderHook(() => useGuidedWeek({
    weekStart, isCurrent: true, tasks: [], choose, onFinish: async () => true, onClose: vi.fn(), onPlanned,
  }), { wrapper })
  const plannedPatches = () => store.patches.filter((x) => (x.p.guide as { plannedAt?: string }).plannedAt)

  it('the first applied Choose verb on the choosing step marks the week planned, once', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [] } }
    const onPlanned = vi.fn()
    const loose = { key: 'x', title: 'Fix the gate', planned: { kind: 'none', label: '' }, verbs: [verb(false), verb()], children: [] }
    const choose = makeChoose({ loose: [loose] as unknown as WeekChoose['loose'] })
    const { result } = hook(choose, onPlanned)
    // A verb that did not save marks nothing.
    await act(async () => { await result.current.choose.loose[0].verbs[0].run() })
    expect(plannedPatches()).toHaveLength(0)
    await act(async () => { await result.current.choose.lines[0].verbs[0].run() })
    await act(async () => { await result.current.choose.loose[0].verbs[1].run() })
    await act(async () => { await result.current.choose.onAddLoose('Call the plumber') })
    expect(plannedPatches()).toHaveLength(1)
    // markPlanned also stamps the row's savedAt (the existing "planned" mark).
    expect(plannedPatches()[0].defaults).toEqual({ savedAt: expect.any(String) })
    expect(onPlanned).toHaveBeenCalledTimes(1)
    // The page's own writers still did the work.
    expect(choose.lines[0].verbs[0].run).toHaveBeenCalledTimes(1)
    expect(choose.onAddLoose).toHaveBeenCalledWith('Call the plumber')
  })

  it('a change card applied on the choosing step marks it too; on any other step nothing', async () => {
    store.notes = { guide: { current: 'inbox', done: [], skipped: [] } }
    const { result } = hook(makeChoose())
    act(() => { result.current.registration?.onApplied?.() })
    await act(async () => { await result.current.choose.lines[0].verbs[0].run() })
    expect(plannedPatches()).toHaveLength(0)
    await act(async () => { await result.current.jump('choose') })
    await act(async () => { result.current.registration?.onApplied?.() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    await act(async () => { result.current.registration?.onApplied?.() })
    expect(plannedPatches()).toHaveLength(1)
  })

  it('a planned mark that did not save tells nobody, and the next applied write tries again', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [] } }
    const onPlanned = vi.fn()
    const { result } = hook(makeChoose(), onPlanned)
    store.fail = true
    await act(async () => { await result.current.choose.lines[0].verbs[0].run() })
    expect(plannedPatches()).toHaveLength(0)
    expect(onPlanned).not.toHaveBeenCalled()
    store.fail = false
    await act(async () => { await result.current.choose.lines[0].verbs[0].run() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    expect(onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a week already planned in this session is not marked again', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [], plannedAt: '2026-09-27T10:00:00Z' } }
    const { result } = hook(makeChoose())
    await act(async () => { await result.current.choose.lines[0].verbs[0].run() })
    expect(store.patches).toEqual([])
  })
})

describe('GuidedWeek — ?step= opens the session on a step', () => {
  it('a valid step id opens on it once, and leaves the URL', async () => {
    open('/week?plan=1&step=calendar')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(where().get('plan')).toBe('1')
    expect(screen.getByText(/Planning the week · step 3 of 7/)).toBeInTheDocument()
  })

  it('step=look-back (Review this week) moves a session left further on back to the look back', async () => {
    store.notes = { guide: { current: 'inbox', done: ['look-back'], skipped: [] } }
    open('/week?plan=1&step=look-back')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(screen.getByText(/Planning the week · step 1 of 7/)).toBeInTheDocument()
  })

  it('date and start beside step survive; only step goes', async () => {
    open('/week?plan=1&step=calendar&date=2026-09-27&start=2026-09-27')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(where().get('plan')).toBe('1')
    expect(where().get('date')).toBe('2026-09-27')
    expect(where().get('start')).toBe('2026-09-27')
    expect(screen.getByText(/Planning the week · step 3 of 7/)).toBeInTheDocument()
  })

  it('an id that is not a step of this level is ignored', async () => {
    open('/week?plan=1&step=vision')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(screen.getByText(/Planning the week · step 1 of 7/)).toBeInTheDocument()
    expect(store.patches).toHaveLength(0)
  })
})
