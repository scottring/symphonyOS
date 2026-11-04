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
const phone = vi.hoisted(() => ({ on: false }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => phone.on }))
vi.mock('@/hooks/usePlannedDinners', () => ({ usePlannedDinners: () => new Map([['2026-09-28', { dateKey: '2026-09-28', title: 'Tacos' }]]) }))
const wall = vi.hoisted(() => ({ add: vi.fn(async (..._a: unknown[]) => true) }))
vi.mock('@/lib/wall/addScratchpadNote', () => ({ addScratchpadNote: wall.add, ownMemberId: async () => 'member-me' }))

import { WeekV2, type WeekDeck } from '@/components/plan/v2/WeekV2'
import { useGuidedWeek } from './useGuidedWeek'
import type { WeekChoose } from '@/components/home/week/useChooseWeek'
import type { SessionFold } from './GuidedPeriod'

const weekStart = new Date(2026, 8, 27) // Sunday
const onWeek = (id: string, extra = {}) => createMockTask({ id, title: id, bucket: 'week', weekStart, commitments: [{ level: 'week', periodStart: weekStart, status: 'open' }], ...extra })

const makeChoose = (over: Partial<WeekChoose> = {}): WeekChoose => ({
  monthWord: 'October', notDoneLastWeek: 0,
  monthLines: [{ id: 'L', title: 'Get the house ready' }],
  placeItems: [], placedCount: 0,
  ...over,
})
const makeDeck = (over: Partial<WeekDeck> = {}): WeekDeck => ({
  mode: null, available: true, cards: [], doneLastWeek: 0, aged: 0, stripDays: [], onSeeAged: vi.fn(),
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
type CanvasOpts = { hideStrip?: boolean; fold?: SessionFold }
function WithDeck({ deck, canvas }: { deck: WeekDeck; canvas: (o?: CanvasOpts) => ReactNode }) {
  const [params] = useSearchParams()
  return <WeekV2 weekStart={weekStart} isCurrent canvas={canvas} deck={{ ...deck, mode: deckModeOf(params) }} />
}
// The week as the page draws it: the month's fold driven by the step, and on
// the look back that sheet turned to last week with its choices.
const canvas = vi.fn((o?: CanvasOpts) => <section aria-label="The days" data-drive={JSON.stringify(o?.fold?.drive ?? null)}>
  {o?.hideStrip ? 'days without the strip' : 'days with the strip'}
  {o?.fold?.look && <aside aria-label="Last week, looking back">{o.fold.look}</aside>}
</section>)
const drive = () => JSON.parse(screen.getByRole('region', { name: 'The days' }).getAttribute('data-drive') ?? 'null')
const lookSheet = () => within(screen.getByRole('complementary', { name: 'Last week, looking back' }))
const band = () => within(screen.getByRole('region', { name: 'Plan the week' }))
const card = (name: string) => within(screen.getByRole('region', { name }))
const stepNow = () => band().getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'step')?.querySelector('.ribbon-step-title')?.textContent
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
afterEach(() => { vi.useRealTimers(); phone.on = false })

describe('GuidedWeek — the Week page while planning', () => {
  it('?plan=1 lays the ribbon over the week: its seven steps, the count, and the week without its strip; the look back on the sheet beside it', () => {
    open('/week?plan=1')
    const session = screen.getByRole('region', { name: 'Planning the week' })
    expect(band().getAllByRole('listitem')).toHaveLength(7)
    expect(stepNow()).toBe('Look back at last week')
    expect(band().getByRole('button', { name: /Read October/ })).toBeInTheDocument()
    expect(within(session).getByText('days without the strip')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Steps in this session' })).toBeNull()
    // Step 1 looks back: the month's sheet beside the week turns to last week.
    expect(drive()).toEqual({ above: true })
    expect(lookSheet().getByLabelText('What went well')).toBeInTheDocument()
    // The step's full header is the conversation's.
    expect(within(session).queryByRole('button', { name: 'Next step' })).toBeNull()
    expect(panel().getByText('Look back at last week')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'week', token: '2026-9-27', threadKey: 'weekly:2026-9-27', stepId: 'look-back' })
  })
  // Phone ruling (final review 2026-11-01): the conversation does not cover
  // the page; the step's controls stand in the session area above the rail.
  it('phone: the band is a row of step chips with Next and Talk to the guide', async () => {
    phone.on = true
    open('/week?plan=1')
    expect(band().getByRole('button', { name: 'Talk to the guide' })).toBeInTheDocument()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(shell.reg?.stepId).toBe('calendar')
    expect(stepNow()).toBe('Calendar check')
  })
  it('desktop: no header on the page and no Talk button', () => {
    open('/week?plan=1')
    const session = screen.getByRole('region', { name: 'Planning the week' })
    expect(within(session).queryByRole('button', { name: 'Talk to the guide' })).toBeNull()
    expect(within(session).queryByRole('banner')).toBeNull()
  })

  it('resuming opens on the saved step, and the registration carries it', () => {
    store.notes = { guide: { current: 'inbox', done: ['look-back', 'read-month', 'calendar'], skipped: [], threadId: 't1' } }
    open('/week?plan=1')
    expect(stepNow()).toBe('Clear the inbox')
    expect(panel().getByText('Clear the inbox')).toBeInTheDocument()
    expect(shell.reg?.stepId).toBe('inbox')
    expect(shell.reg?.threadId).toBe('t1')
    expect(shell.reg?.sessionContext.guide).toMatchObject({ stepId: 'inbox', writes: ['inbox'], aboveLines: [{ id: 'L', title: 'Get the house ready' }] })
  })

  // Walk 2026-11-01: "Look back at last week" stood beside the week being
  // planned. The page shows the week each step is about; the session, its
  // count and its thread stay the planned week's.
  it('the look back turns the month’s sheet to last week; the next step gives it back; the count is this week’s throughout', async () => {
    open('/week?plan=1', makeDeck({ onThisWeek: 3 }))
    expect(lookSheet().getByText('Not done last week')).toBeInTheDocument()
    expect(band().getByText('3 of about 15 on this week')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ token: '2026-9-27', stepId: 'look-back' })
    expect(shell.reg?.sessionContext.guide?.counts).toEqual({ label: 'tasks on this week', n: 3, of: 'about 15' })
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(screen.queryByRole('complementary', { name: 'Last week, looking back' })).toBeNull()
    expect(drive()).toEqual({})
    expect(band().getByText('3 of about 15 on this week')).toBeInTheDocument()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Read October/ })) })
    expect(drive()).toEqual({ above: true })
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Look back at last week/ })) })
    expect(shell.reg?.stepId).toBe('look-back')
    expect(lookSheet().getByText('Not done last week')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ token: '2026-9-27', threadKey: 'weekly:2026-9-27' })
  })
  it('Next step moves the registration on; tapping a step jumps there; Back goes back', async () => {
    open('/week?plan=1')
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(shell.reg?.stepId).toBe('calendar')
    expect(panel().getByText('Calendar check')).toBeInTheDocument()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Choose this week/ })) })
    expect(shell.reg?.stepId).toBe('choose')
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Back' })) })
    expect(shell.reg?.stepId).toBe('inbox')
  })
  it('the look back on the sheet beside the week; the calendar check and the inbox in the card under the band; Read October is the month itself', async () => {
    const gate = { key: 'gate', title: 'Fix the gate', done: vi.fn(async () => true), nextWeek: vi.fn(async () => true), someday: vi.fn(async () => true), letGo: vi.fn(async () => true) }
    const vet = createMockTask({ id: 'vet', title: 'Book the vet', bucket: 'inbox' })
    const deck = makeDeck({
      aged: 2, doneLastWeek: 3, plannedLastWeek: 4,
      choose: makeChoose({ notDoneLastWeek: 1, looseEnds: [gate] }),
      cards: [{ key: 'vet', task: vet, source: 'inbox', facts: 'Captured Monday' }],
      events: [{ id: 'e1', title: 'Dentist', start: new Date(2026, 8, 28, 9), end: new Date(2026, 8, 28, 10) }, { id: 'e2', title: 'Team call', start: new Date(2026, 8, 28, 9, 30), end: new Date(2026, 8, 28, 11) }],
    })
    open('/week?plan=1', deck)
    // 1 · Look back: the notes save as last week's review; the loose end and the sweep's note.
    fireEvent.change(lookSheet().getByLabelText('What went well'), { target: { value: 'Rested' } })
    await act(async () => { fireEvent.click(lookSheet().getByRole('button', { name: 'Save notes' })) })
    expect(review.finish).toHaveBeenCalledWith({ wentWell: 'Rested', didnt: '' })
    expect(within(lookSheet().getByRole('listitem', { name: 'Fix the gate' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Done', 'Next week', 'Someday', 'Let go'])
    expect(lookSheet().queryByRole('button', { name: /^Back to / })).toBeNull()
    await act(async () => { fireEvent.click(lookSheet().getByRole('button', { name: 'Let go: Fix the gate' })) })
    expect(gate.letGo).toHaveBeenCalled()
    expect(lookSheet().getByText(/Moved 2 untouched things to Later/)).toBeInTheDocument()
    // 2 · Calendar check, before the month (Scott, 2026-11-02): the clash, flagged on its day.
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(card('Calendar check').getByText('Overlap: Dentist and Team call')).toBeInTheDocument()
    // 3 · Read October: the month's own sheet, opened beside the week; no card.
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(drive()).toEqual({ above: true })
    expect(document.querySelector('.ribbon-card')).toBeNull()
    // 4 · Clear the inbox: filed through the deck's writers.
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    await act(async () => { fireEvent.click(card('Clear the inbox').getByRole('button', { name: 'This week: Book the vet' })) })
    expect(deck.actions.keepThisWeek).toHaveBeenCalledWith(deck.cards[0])
  })
  it('Choose this week’s tasks is the week itself with the month open beside it; weekly ops and tell the family drop their cards', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [] } }
    const dog = createMockRoutine({ id: 'dog', name: 'Walk the dog', time_of_day: '07:00:00', recurrence_pattern: { type: 'daily' } as RecurrencePattern })
    const deck = makeDeck({
      tasks: [onWeek('a'), onWeek('gate', { title: 'Fix the gate', context: 'family' }), onWeek('board', { title: 'Board deck', context: 'work' })],
      onThisWeek: 3,
      routines: [dog],
    })
    open('/week?plan=1', deck)
    // 5 · Choose: the month beside the week, no card; the count on the band.
    expect(drive()).toEqual({ above: true })
    expect(document.querySelector('.ribbon-card')).toBeNull()
    expect(band().getByText('3 of about 15 on this week')).toBeInTheDocument()
    // 6 · Weekly ops: dinners, routines, the weekend note on the same row.
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    const ops = () => card('Weekly ops')
    expect(ops().getByText('Tacos')).toBeInTheDocument()
    expect(ops().getByRole('link', { name: 'Open the meal plan' })).toHaveAttribute('href', '/meals/plan?week=2026-09-27')
    expect(ops().getByText('7a Walk the dog')).toBeInTheDocument()
    fireEvent.change(ops().getByLabelText('What the weekend is for'), { target: { value: 'The lake' } })
    await act(async () => { fireEvent.click(ops().getByRole('button', { name: 'Save weekend note' })) })
    expect(store.patches.at(-1)?.p).toEqual({ weekend: 'The lake' })
    expect(store.notes.weekend).toBe('The lake')
    // 7 · Tell the family: the week's Family items for reference; only what
    // is typed is posted, kept until the week is over.
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    const family = () => card('Tell the family')
    expect(family().getByRole('list', { name: 'This week’s Family items' })).toHaveTextContent('Fix the gate')
    expect(family().queryByText('Board deck')).toBeNull()
    fireEvent.change(family().getByLabelText('What should the family know?'), { target: { value: 'Grandma Thursday' } })
    await act(async () => { fireEvent.click(family().getByRole('button', { name: 'Post to the wall' })) })
    expect(wall.add).toHaveBeenCalledWith('me', 'Grandma Thursday', 'note', 'member-me', new Date(2026, 9, 4))
    expect(family().getByRole('status')).toHaveTextContent('Posted 1 note')
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
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Choose this week/ })) })
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
    fireEvent.change(lookSheet().getByLabelText('What went well'), { target: { value: 'Rested' } })
    expect(lookSheet().getByText('Not saved yet')).toBeInTheDocument()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(screen.queryByLabelText('What went well')).toBeNull()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Look back at last week/ })) })
    expect(lookSheet().getByLabelText('What went well')).toHaveValue('Rested')
    expect(lookSheet().getByText('Not saved yet')).toBeInTheDocument()
    expect(review.finish).not.toHaveBeenCalled()
  })
  // The count is the page's own (WeekViewV2 counts the rows it draws), never
  // worked out again here from a different list.
  it('the count reads "{n} of about 15": the page’s own count of what it draws on this week', () => {
    const tasks = [onWeek('a'), onWeek('b', { completed: true }), onWeek('c'), onWeek('d'), createMockTask({ id: 'inbox', bucket: 'inbox' })]
    open('/week?plan=1', makeDeck({ tasks, onThisWeek: 3 }))
    expect(screen.getByText('3 of about 15 on this week')).toBeInTheDocument()
    expect(shell.reg?.sessionContext.guide.counts).toEqual({ label: 'tasks on this week', n: 3, of: 'about 15' })
  })

  it('"Done planning the week" runs the week’s closing writes, then finishes the session, then closes it', async () => {
    store.notes = { guide: { current: 'family', done: [], skipped: [] } }
    const deck = makeDeck()
    open('/week?plan=1', deck)
    expect(panel().queryByRole('button', { name: 'Next step' })).toBeNull()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Done planning the week' })) })
    await waitFor(() => expect(where().get('plan')).toBeNull())
    expect(store.order).toEqual(['review', 'planned', 'finished'])
    expect((store.notes.guide as { finishedAt?: string }).finishedAt).toEqual(expect.any(String))
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(screen.getByText('days with the strip')).toBeInTheDocument()
    expect(shell.reg).toBeNull()
  })

  // Fix round 1 ruling: Done planning folds the month beside the week and
  // remembers it folded.
  it('"Done planning the week" leaves the month’s fold folded, remembered', async () => {
    localStorage.setItem('symphony-fold:week', 'open')
    store.notes = { guide: { current: 'family', done: [], skipped: [] } }
    open('/week?plan=1')
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Done planning the week' })) })
    await waitFor(() => expect(where().get('plan')).toBeNull())
    expect(localStorage.getItem('symphony-fold:week')).toBe('folded')
    localStorage.removeItem('symphony-fold:week')
  })

  it('Leave closes without finishing and keeps where the session is', async () => {
    store.notes = { guide: { current: 'calendar', done: ['look-back'], skipped: ['read-month'] } }
    const deck = makeDeck()
    open('/week?plan=1', deck)
    fireEvent.click(band().getByRole('button', { name: 'Leave' }))
    expect(where().get('plan')).toBeNull()
    expect(screen.getByText('days with the strip')).toBeInTheDocument()
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
  const hook = (onPlanned = vi.fn()) => renderHook(() => useGuidedWeek({
    weekStart, count: 0, choose: makeChoose(), onFinish: async () => true, onClose: vi.fn(), onPlanned,
  }), { wrapper })
  const plannedPatches = () => store.patches.filter((x) => (x.p.guide as { plannedAt?: string }).plannedAt)

  it('the first write applied on the choosing step marks the week planned, once', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [] } }
    const onPlanned = vi.fn()
    const { result } = hook(onPlanned)
    await act(async () => { await result.current.markPlannedOnce() })
    await act(async () => { await result.current.markPlannedOnce() })
    expect(plannedPatches()).toHaveLength(1)
    // markPlanned also stamps the row's savedAt (the existing "planned" mark).
    expect(plannedPatches()[0].defaults).toEqual({ savedAt: expect.any(String) })
    expect(onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a change card applied on the choosing step marks it too; on any other step nothing', async () => {
    store.notes = { guide: { current: 'inbox', done: [], skipped: [] } }
    const { result } = hook()
    act(() => { result.current.registration?.onApplied?.() })
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
    const { result } = hook(onPlanned)
    store.fail = true
    await act(async () => { await result.current.markPlannedOnce() })
    expect(plannedPatches()).toHaveLength(0)
    expect(onPlanned).not.toHaveBeenCalled()
    store.fail = false
    await act(async () => { await result.current.markPlannedOnce() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    expect(onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a week already planned in this session is not marked again', async () => {
    store.notes = { guide: { current: 'choose', done: [], skipped: [], plannedAt: '2026-09-27T10:00:00Z' } }
    const { result } = hook()
    await act(async () => { await result.current.markPlannedOnce() })
    expect(store.patches).toEqual([])
  })
})

describe('GuidedWeek — ?step= opens the session on a step', () => {
  it('a valid step id opens on it once, and leaves the URL', async () => {
    open('/week?plan=1&step=calendar')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(where().get('plan')).toBe('1')
    expect(stepNow()).toBe('Calendar check')
  })

  it('step=look-back (Review this week) moves a session left further on back to the look back', async () => {
    store.notes = { guide: { current: 'inbox', done: ['look-back'], skipped: [] } }
    open('/week?plan=1&step=look-back')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(stepNow()).toBe('Look back at last week')
  })

  it('date and start beside step survive; only step goes', async () => {
    open('/week?plan=1&step=calendar&date=2026-09-27&start=2026-09-27')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(where().get('plan')).toBe('1')
    expect(where().get('date')).toBe('2026-09-27')
    expect(where().get('start')).toBe('2026-09-27')
    expect(stepNow()).toBe('Calendar check')
  })

  it('an id that is not a step of this level is ignored', async () => {
    open('/week?plan=1&step=vision')
    await waitFor(() => expect(where().get('step')).toBeNull())
    expect(stepNow()).toBe('Look back at last week')
    expect(store.patches).toHaveLength(0)
  })
})
