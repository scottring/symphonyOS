import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createMockTask } from '@/test/mocks/factories'
import { GuidedSessionProvider, useGuidedSession, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'
import type { DayPictureItem } from './DayRows'
import type { DayActions } from '@/lib/planning/dayActions'

// The person's notes row for the day, in memory (the real merge is
// usePlanningNotes' own test).
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
const review = vi.hoisted(() => ({ reviewed: null, mine: null as null | { wentWell: string; didnt: string }, loading: false, error: null, reload: vi.fn(), finish: vi.fn(async (_n: unknown) => true) }))
const reviewTokens = vi.hoisted(() => [] as string[])
vi.mock('@/hooks/usePeriodReview', () => ({ usePeriodReview: (_h: string, token: string) => { reviewTokens.push(token); return review } }))

import { GuidedDay } from './GuidedDay'

const SUN = new Date(2026, 10, 1), MON = new Date(2026, 10, 2), TUE = new Date(2026, 10, 3)
const inv = createMockTask({ id: 'i', title: 'Inventory all documents' })
const left = createMockTask({ id: 'l', title: 'Sign kids up for Coppermine' })
const dayItems: DayPictureItem[] = [
  { key: 'event-1', time: '9am', title: 'UPM kick-off', kind: 'event' },
  { key: 'routine-r', time: '7am', title: 'Walk the dog', kind: 'routine' },
  { key: 'task-a', title: 'Fix the gate', kind: 'task' },
  { key: 'task-b', time: '2pm', title: 'Call the bank', kind: 'task' },
]
const actions = (): DayActions => ({
  place: vi.fn(async () => true), done: vi.fn(async () => true),
  undone: vi.fn(async () => true), backToWeek: vi.fn(async () => true), restore: vi.fn(async () => true),
})

const shell = { reg: null as GuidedSessionRegistration | null }
function Shell() {
  const reg = useGuidedSession()
  useEffect(() => { shell.reg = reg })
  return reg ? <div data-testid="guide-panel">{reg.header}</div> : null
}
const panel = () => within(screen.getByTestId('guide-panel'))
// The planning ribbon (2026-11-04): its band, and the card each step drops under it.
const rail = () => within(document.querySelector<HTMLElement>('.ribbon-session')!)
const stepNow = () => [...document.querySelectorAll('.ribbon-step')].find((b) => b.getAttribute('aria-current') === 'step')?.querySelector('.ribbon-step-title')?.textContent

function Where() { return <output data-testid="where">{useLocation().search}</output> }
function open(over: Partial<Parameters<typeof GuidedDay>[0]> = {}, url = '/today?plan=1') {
  const props = {
    target: MON, lookBackOn: SUN, isTomorrow: false,
    canvas: <section aria-label="The day itself">the page</section>,
    dayItems, lookBack: { open: [left], done: [] }, choice: { missed: [], groups: [{ title: 'Also this week', tasks: [inv] }], otherDays: [] },
    actions: actions(), goalLabel: () => undefined,
    onFinish: vi.fn(async () => { store.order.push('planned'); return true }), onClose: vi.fn(), onPlanned: vi.fn(),
    ...over,
  }
  const view = render(<MemoryRouter initialEntries={[url]}><GuidedSessionProvider><GuidedDay {...props} /><Shell /><Where /></GuidedSessionProvider></MemoryRouter>)
  return { ...view, props }
}
const plannedPatches = () => store.patches.filter((x) => (x.p.guide as { plannedAt?: string } | undefined)?.plannedAt)

beforeEach(() => {
  store.notes = {}; store.patches = []; store.order = []; store.fail = false
  shell.reg = null; reviewTokens.length = 0
  review.mine = null
  review.finish.mockReset(); review.finish.mockImplementation(async () => { store.order.push('review'); return true })
})

describe('GuidedDay — Today while planning the day', () => {
  it('opens on the page: the ribbon’s band with the day’s count and five steps, the step’s card, and the day itself', () => {
    open()
    const session = screen.getByRole('region', { name: 'Planning today' })
    expect(stepNow()).toBe('Look back at yesterday')
    expect(within(session).getByText('2 of 3–5 on today')).toBeInTheDocument()
    expect(within(session).getByRole('region', { name: 'Look back at yesterday' })).toBeInTheDocument()
    expect([...document.querySelectorAll('.ribbon-step-title')].map((el) => el.textContent))
      .toEqual(['Look back at yesterday', 'Today\'s calendar', 'Energy', 'Pick 3 to 5', 'Habits'])
    expect(within(session).getByRole('region', { name: 'The day itself' })).toBeInTheDocument()
    expect(panel().getByText('Look back at yesterday')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'day', token: '2026-11-2', threadKey: 'daily:2026-11-2', stepId: 'look-back' })
    expect(shell.reg?.sessionContext.guide).toMatchObject({ level: 'day', stepId: 'look-back', counts: { label: 'tasks on today', n: 2, of: '3–5' } })
    // The look back's win is yesterday's review.
    expect(reviewTokens).toContain('2026-11-1')
  })

  it('in the evening it plans tomorrow: titles say today and tomorrow', () => {
    open({ target: TUE, lookBackOn: MON, isTomorrow: true })
    expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument()
    expect(rail().getByRole('button', { name: /Look back at today/ })).toBeInTheDocument()
    expect(rail().getByRole('button', { name: /Tomorrow's calendar/ })).toBeInTheDocument()
    expect(panel().getByText('Look back at today')).toBeInTheDocument()
    expect(screen.getByText('2 of 3–5 on tomorrow')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ token: '2026-11-3' })
    expect(reviewTokens).toContain('2026-11-2')
  })

  it('resumes on the saved step; the calendar step shows the day, habits its routines', async () => {
    store.notes = { guide: { current: 'calendar', done: ['look-back'], skipped: [] } }
    open()
    expect(stepNow()).toBe('Today\'s calendar')
    const day = within(rail().getByRole('group', { name: 'Monday, as it stands' }))
    expect(day.getByText('UPM kick-off')).toBeInTheDocument()
    expect(day.getByText('Fix the gate')).toBeInTheDocument()
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: /Habits/ })) })
    expect(rail().getByText('Walk the dog')).toBeInTheDocument()
    expect(rail().queryByText('UPM kick-off')).toBeNull()
  })

  it('Energy saves the note beside the day', async () => {
    store.notes = { guide: { current: 'energy', done: [], skipped: [] } }
    open()
    await act(async () => { fireEvent.click(rail().getByLabelText('Medium')) })
    expect(store.patches.at(-1)?.p).toEqual({ energy: { level: 'medium' } })
  })

  it('the first pick on the pick step marks the day planned, once', async () => {
    store.notes = { guide: { current: 'pick', done: [], skipped: [] } }
    const { props } = open()
    expect(rail().getByText('That’s 2 of 3–5.')).toBeInTheDocument()
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Today: Inventory all documents' })) })
    expect(props.actions.place).toHaveBeenCalledWith(inv, MON)
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    expect(plannedPatches()[0].defaults).toEqual({ savedAt: expect.any(String) })
    expect(props.onPlanned).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Undo: Inventory all documents' })) })
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Today: Inventory all documents' })) })
    expect(plannedPatches()).toHaveLength(1)
  })

  it('Done on a row in Pick counts as applied too (one rule with the Week)', async () => {
    store.notes = { guide: { current: 'pick', done: [], skipped: [] } }
    const { props } = open()
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Done: Inventory all documents' })) })
    expect(props.actions.done).toHaveBeenCalledWith(inv)
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
  })

  it('a placement saved on the page itself (a drag onto the day) marks it on the pick step only', async () => {
    store.notes = { guide: { current: 'energy', done: [], skipped: [] } }
    const listening = { fn: null as null | (() => void) }
    const stop = vi.fn()
    const view = open({ listenPlacements: (fn) => { listening.fn = fn; return stop } })
    await act(async () => { listening.fn?.() })
    expect(plannedPatches()).toHaveLength(0)
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: /Pick 3 to 5/ })) })
    await act(async () => { listening.fn?.() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    view.unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('Habits says so when the page hides routines', () => {
    store.notes = { guide: { current: 'habits', done: [], skipped: [] } }
    open({ routinesHidden: true, dayItems: dayItems.filter((i) => i.kind !== 'routine') })
    expect(rail().getByText('Routines are hidden on this page.')).toBeInTheDocument()
  })

  it('a pick on another step, or one that did not save, marks nothing', async () => {
    store.notes = { guide: { current: 'look-back', done: [], skipped: [] } }
    open()
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: 'Today: Sign kids up for Coppermine' })) })
    expect(plannedPatches()).toHaveLength(0)
  })

  it('a change card applied on the pick step marks it too', async () => {
    store.notes = { guide: { current: 'pick', done: [], skipped: [] } }
    open()
    await act(async () => { shell.reg?.onApplied?.() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
  })

  it('"Done planning today" saves an unsaved win, runs the closing write, finishes and closes', async () => {
    const { props } = open()
    fireEvent.change(rail().getByLabelText('A win yesterday'), { target: { value: 'Shipped it' } })
    // On to Habits, past the steps between: the win's draft is the session's.
    await act(async () => { fireEvent.click(rail().getByRole('button', { name: /Habits/ })) })
    expect(panel().queryByRole('button', { name: 'Next step' })).toBeNull()
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Done planning today' })) })
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(review.finish).toHaveBeenCalledWith({ wentWell: 'Shipped it', didnt: '' })
    expect(store.order).toEqual(['review', 'planned', 'finished'])
  })

  it('a closing write that fails keeps the session open', async () => {
    store.notes = { guide: { current: 'habits', done: [], skipped: [] } }
    const { props } = open({ isTomorrow: true, target: TUE, lookBackOn: MON, onFinish: vi.fn(async () => false) })
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Done planning tomorrow' })) })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(store.order).not.toContain('finished')
  })

  it('Leave closes and keeps everything as it is', () => {
    store.notes = { guide: { current: 'energy', done: ['look-back'], skipped: ['calendar'] } }
    const { props } = open()
    fireEvent.click(rail().getByRole('button', { name: 'Leave' }))
    expect(props.onClose).toHaveBeenCalled()
    expect(store.patches).toEqual([])
    expect(review.finish).not.toHaveBeenCalled()
  })
})

describe('GuidedDay — ?step= opens the session on a step', () => {
  it('a valid step id opens on it once, and leaves the URL', async () => {
    open({}, '/today?plan=1&step=energy')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('?plan=1'))
    expect(stepNow()).toBe('Energy')
  })

  it('an id that is not a step of this level is ignored', async () => {
    open({}, '/today?plan=1&step=vision')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('?plan=1'))
    expect(stepNow()).toBe('Look back at yesterday')
    expect(store.patches).toHaveLength(0)
  })
})
