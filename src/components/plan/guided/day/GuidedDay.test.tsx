import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
import { GuidedDay } from './GuidedDay'

const MON = new Date(2026, 10, 2), TUE = new Date(2026, 10, 3)
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
// The session's one tooltip (GuideCoach) and the step it shows.
const coach = () => within(screen.getByRole('dialog', { name: 'Planning guide' }))
const stepNow = () => document.querySelector('.coach-t')?.textContent
const next = async (n = 1) => { for (let i = 0; i < n; i++) await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Next' })) }) }

function Where() { return <output data-testid="where">{useLocation().search}</output> }
function open(over: Partial<Parameters<typeof GuidedDay>[0]> = {}, url = '/today?plan=1') {
  const props = {
    target: MON, isTomorrow: false,
    canvas: <section aria-label="The day itself">the page</section>,
    dayItems, actions: actions(),
    onFinish: vi.fn(async () => { store.order.push('planned'); return true }), onClose: vi.fn(), onPlanned: vi.fn(),
    ...over,
  }
  const view = render(<MemoryRouter initialEntries={[url]}><GuidedSessionProvider><GuidedDay {...props} /><Shell /><Where /></GuidedSessionProvider></MemoryRouter>)
  return { ...view, props }
}
const plannedPatches = () => store.patches.filter((x) => (x.p.guide as { plannedAt?: string } | undefined)?.plannedAt)

beforeEach(() => {
  store.notes = {}; store.patches = []; store.order = []; store.fail = false
  shell.reg = null
})

describe('GuidedDay — Today while planning the day', () => {
  it('opens on the page: the day itself, unchanged, and the first step’s tooltip; no band, no card', () => {
    open()
    const session = screen.getByRole('region', { name: 'Planning today' })
    expect(stepNow()).toBe('Look back at yesterday')
    expect(coach().getByText('Step 1 of 5')).toBeInTheDocument()
    expect(within(session).getByRole('region', { name: 'The day itself' })).toBeInTheDocument()
    expect(document.querySelector('.ribbon-band, .ribbon-card, .ribbon-session')).toBeNull()
    expect(panel().getByText('Look back at yesterday')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'day', token: '2026-11-2', threadKey: 'daily:2026-11-2', stepId: 'look-back' })
    expect(shell.reg?.sessionContext.guide).toMatchObject({ level: 'day', stepId: 'look-back', counts: { label: 'tasks on today', n: 2, of: '3–5' } })
  })

  it('in the evening it plans tomorrow: titles say today and tomorrow', async () => {
    open({ target: TUE, isTomorrow: true })
    expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument()
    expect(stepNow()).toBe('Look back at today')
    expect(panel().getByText('Look back at today')).toBeInTheDocument()
    await next()
    expect(stepNow()).toBe('Tomorrow\'s calendar')
    expect(shell.reg).toMatchObject({ token: '2026-11-3' })
    expect(shell.reg?.sessionContext.guide).toMatchObject({ counts: { label: 'tasks on tomorrow', n: 2 } })
  })

  it('resumes on the saved step and tells the page which step it is on', async () => {
    store.notes = { guide: { current: 'calendar', done: ['look-back'], skipped: [] } }
    const onStep = vi.fn()
    open({ onStep })
    expect(stepNow()).toBe('Today\'s calendar')
    expect(onStep).toHaveBeenLastCalledWith('calendar')
    await next(3)
    expect(stepNow()).toBe('Habits')
    expect(onStep).toHaveBeenLastCalledWith('habits')
    expect(coach().getByRole('button', { name: 'Done planning today' })).toBeInTheDocument()
  })

  it('a placement saved on the page itself (a drag onto the day, + on the week) marks it on the pick step only', async () => {
    store.notes = { guide: { current: 'energy', done: [], skipped: [] } }
    const listening = { fn: null as null | (() => void) }
    const stop = vi.fn()
    const view = open({ listenPlacements: (fn) => { listening.fn = fn; return stop } })
    await act(async () => { listening.fn?.() })
    expect(plannedPatches()).toHaveLength(0)
    await next()
    expect(stepNow()).toBe('Pick 3 to 5')
    await act(async () => { listening.fn?.() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
    expect(plannedPatches()[0].defaults).toEqual({ savedAt: expect.any(String) })
    await act(async () => { listening.fn?.() })
    expect(plannedPatches()).toHaveLength(1)
    view.unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('a change card applied on the pick step marks it too', async () => {
    store.notes = { guide: { current: 'pick', done: [], skipped: [] } }
    open()
    await act(async () => { shell.reg?.onApplied?.() })
    await waitFor(() => expect(plannedPatches()).toHaveLength(1))
  })

  it('"Done planning today" runs the closing write, finishes and closes', async () => {
    store.notes = { guide: { current: 'habits', done: [], skipped: [] } }
    const { props } = open()
    expect(panel().queryByRole('button', { name: 'Next step' })).toBeNull()
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Done planning today' })) })
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(store.order).toEqual(['planned', 'finished'])
  })

  it('a closing write that fails keeps the session open', async () => {
    store.notes = { guide: { current: 'habits', done: [], skipped: [] } }
    const { props } = open({ isTomorrow: true, target: TUE, onFinish: vi.fn(async () => false) })
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Done planning tomorrow' })) })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(store.order).not.toContain('finished')
  })

  it('the tooltip’s ✕ hides it and the session stays', () => {
    store.notes = { guide: { current: 'energy', done: ['look-back'], skipped: ['calendar'] } }
    const { props } = open()
    fireEvent.click(coach().getByRole('button', { name: 'Hide the guide' }))
    expect(screen.queryByRole('dialog', { name: 'Planning guide' })).toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Planning today' })).toBeInTheDocument()
    expect(store.patches).toEqual([])
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
