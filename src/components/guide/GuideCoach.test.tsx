import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect, useReducer, type ReactNode } from 'react'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { GuideState } from '@/lib/guide/guidedPlan'
import type { Task } from '@/types/task'

// The guide's state and the tasks list, as small live stores: a write makes
// the bar re-render, as the real providers do.
const h = vi.hoisted(() => {
  const make = <T,>(initial: T) => {
    const s = { value: initial, subs: new Set<() => void>() }
    return { s, get: () => s.value, put: (v: T) => { s.value = v; s.subs.forEach((f) => f()) } }
  }
  const guide = make<unknown>(null)
  const tasks = make<unknown[]>([])
  const goalListeners = new Set<(g: { id: string; name: string; year: number }) => void>()
  return { guide, tasks, goalListeners, set: { fn: null as null | ((s: unknown) => Promise<void>) } }
})
function useStore<T>(store: { s: { value: T; subs: Set<() => void> } }): T {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => { store.s.subs.add(force); return () => { store.s.subs.delete(force) } }, [store])
  return store.s.value
}
const set = vi.fn(async (s: GuideState | null) => { h.guide.put(s) })
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => ({ state: useStore(h.guide), loaded: true, savedIn: 'account', set }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: useStore(h.tasks), loading: false, error: null }) }))
vi.mock('@/hooks/useGoals', () => ({ onGoalAdded: (fn: (g: { id: string; name: string; year: number }) => void) => { h.goalListeners.add(fn); return () => h.goalListeners.delete(fn) } }))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn(async () => true) }
vi.mock('@/hooks/usePlanningSession', async () => {
  const real = await vi.importActual<typeof import('@/hooks/usePlanningSession')>('@/hooks/usePlanningSession')
  return { ...real, usePlanningSession: () => session }
})
vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))

import { GuideBar } from './GuideBar'
import { readCadenceConfig } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'

// The week's number as this test's cadence numbers it.
const WK = () => `Week ${weekOfYear(new Date(2026, 8, 26), readCadenceConfig().weekStartsOn)}`

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p> }
/** The real page's control, with its anchor — or none, to see the fallback. */
function Page({ target = 'period-add' as string | null, label = 'Add to October', extra = null as ReactNode }) {
  return (
    <>
      {target && <form data-guide-target={target}><input aria-label={label} /></form>}
      {extra}
      <Where />
    </>
  )
}
const show = (at: string, page = <Page />) => render(
  <MemoryRouter initialEntries={[at]}><GuideBar /><Routes><Route path="*" element={page} /></Routes></MemoryRouter>,
)
const monthRun = (over: Partial<GuideState> = {}): GuideState => ({
  v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01', week: '2026-09-26', today: '2026-09-29' },
  current: 0, done: [], status: 'active', updatedAt: '', ...over,
})
const existing = { id: 'old', title: 'Already there', completed: false, monthStart: new Date(2026, 9, 1), createdAt: new Date(2026, 8, 1) } as Task
const coach = () => screen.queryByRole('complementary', { name: 'Show me where things go' })
const toggle = () => screen.getByRole('button', { name: /Show me where things go/ })

describe('Show me where things go', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 10))
    h.guide.s.value = null; h.guide.s.subs.clear(); h.tasks.s.value = [existing]; h.tasks.s.subs.clear(); h.goalListeners.clear()
    set.mockClear(); session.save.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('is off unless chosen: the guide runs as before, with the toggle unpressed', () => {
    h.guide.s.value = monthRun()
    show('/month?start=2026-10-01')
    expect(screen.getByRole('region', { name: 'Guided planning' })).toBeTruthy()
    expect(coach()).toBeNull()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-guide-coach]')).toBeNull()
  })

  it('on: points at the one real control, in words and with an outline, without taking focus', () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/month?start=2026-10-01')
    expect(coach()).toBeTruthy()
    expect(screen.getByText('Write one thing for October.')).toBeTruthy()
    expect(screen.getByText(/Type it in “Add to October” and press Enter/)).toBeTruthy()
    const target = document.querySelector('[data-guide-target="period-add"]')!
    expect(target.getAttribute('data-guide-coach')).toBe('do')
    expect(document.activeElement).toBe(document.body)
    // Asked, it takes you there.
    fireEvent.click(screen.getByRole('button', { name: 'Take me there' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Add to October'))
  })

  it('the real write — not a click — moves it on: “Saved to October.”, announced, kept with the run', async () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/month?start=2026-10-01')
    expect(set).not.toHaveBeenCalled()
    // Another month's line is not this step's action.
    act(() => h.tasks.put([existing, { ...existing, id: 'sep', title: 'September thing', monthStart: new Date(2026, 8, 1) }]))
    expect(set).not.toHaveBeenCalled()
    act(() => h.tasks.put([...h.tasks.get(), { ...existing, id: 'new', title: 'Finish the patio' }]))
    await waitFor(() => expect(set).toHaveBeenCalled())
    expect(set.mock.calls.at(-1)![0]).toMatchObject({ coachDone: { month: { id: 'new', title: 'Finish the patio', saved: 'Saved to October.' } } })
    const live = coach()!.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toContain('Saved to October.')
    expect(live.textContent).toContain('“Finish the patio”. It stays on October’s list as you plan the weeks.')
    expect(live.textContent).toContain('Mark October planned and continue')
    // It now points at the guide's own way on.
    expect(screen.getByRole('button', { name: 'Mark October planned and continue' }).getAttribute('data-guide-coach')).toBe('next')
    expect(document.querySelector('[data-guide-target="period-add"]')!.hasAttribute('data-guide-coach')).toBe(false)
  })

  it('the week step: “Saved to Week N. It’s still on October’s list.”', async () => {
    h.guide.s.value = monthRun({ coach: true, current: 1, done: ['month'] })
    show('/week?start=2026-09-26', <Page target="week-choose" label="Add Finish the patio to this week" />)
    expect(screen.getByText(`Choose one step for ${WK()}.`)).toBeTruthy()
    // The month line taken into the week: an update, not a new row.
    act(() => h.tasks.put([{ ...existing, weekStart: new Date(2026, 8, 26), bucket: 'week' }]))
    await waitFor(() => expect(coach()!.textContent).toContain(`Saved to ${WK()}.`))
    expect(coach()!.textContent).toContain('“Already there”. It’s still on October’s list.')
  })

  it('Esc hides it and the guide carries on; the toggle brings it back', async () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/month?start=2026-10-01')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Take me there' }), { key: 'Escape' })
    expect(coach()).toBeNull()
    expect(document.querySelector('[data-guide-coach]')).toBeNull()
    expect(screen.getByRole('region', { name: 'Guided planning' })).toBeTruthy()
    expect(set).not.toHaveBeenCalled()
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    // Still watching while out of sight: the action is kept.
    act(() => h.tasks.put([...h.tasks.get(), { ...existing, id: 'new', title: 'Finish the patio' }]))
    await waitFor(() => expect(set).toHaveBeenCalled())
    fireEvent.click(toggle())
    expect(coach()!.textContent).toContain('Saved to October.')
  })

  it('Esc from the outlined control hides it too', () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/month?start=2026-10-01')
    fireEvent.keyDown(screen.getByLabelText('Add to October'), { key: 'Escape' })
    expect(coach()).toBeNull()
  })

  it('the toggle turns it on and off for the rest of the run', async () => {
    h.guide.s.value = monthRun()
    show('/month?start=2026-10-01')
    fireEvent.click(toggle())
    await waitFor(() => expect(coach()).toBeTruthy())
    expect(h.guide.get()).toMatchObject({ coach: true })
    fireEvent.click(toggle())
    await waitFor(() => expect(coach()).toBeNull())
    expect(h.guide.get()).toMatchObject({ coach: false, status: 'active', current: 0 })
  })

  it('Skip this: no action needed, and it stays skipped', async () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/month?start=2026-10-01')
    fireEvent.click(screen.getByRole('button', { name: 'Skip this' }))
    await waitFor(() => expect(coach()).toBeNull())
    expect(h.guide.get()).toMatchObject({ status: 'active', current: 0, coachDone: { month: { skipped: true } } })
  })

  it('Back and Save and leave still work with it showing', async () => {
    h.guide.s.value = monthRun({ coach: true, current: 1, done: ['month'] })
    const view = show('/week?start=2026-09-26', <Page label="Add to this week" />)
    expect(coach()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01'))
    expect(h.guide.get()).toMatchObject({ current: 0, coach: true })
    fireEvent.click(screen.getByRole('button', { name: 'Save and leave' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/today'))
    expect(h.guide.get()).toMatchObject({ status: 'paused', coach: true })
    view.unmount()
  })

  it('continue still moves on after an acknowledgment', async () => {
    h.guide.s.value = monthRun({ coach: true, coachDone: { month: { id: 'new', title: 'Finish the patio', saved: 'Saved to October.', at: '' } } })
    show('/month?start=2026-10-01')
    fireEvent.click(screen.getByRole('button', { name: 'Mark October planned and continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/week?start=2026-09-26'))
    expect(h.guide.get()).toMatchObject({ current: 1, done: ['month'], coach: true })
  })

  it('no anchor on the page: it says it in words, and nothing breaks', () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/month?start=2026-10-01', <Page target={null} />)
    expect(screen.getByText('Write one thing for October.')).toBeTruthy()
    expect(screen.getByText('Look for “Add to October” under October’s list, type one thing, and press Enter.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take me there' })).toBeNull()
  })

  it('today points at the step the week took, and acknowledges it keeps its week', async () => {
    const weekTask = { ...existing, id: 'w1', title: 'Email two piano teachers', monthStart: undefined, weekStart: new Date(2026, 8, 26), bucket: 'week' } as Task
    h.tasks.s.value = [weekTask]
    h.guide.s.value = monthRun({ coach: true, current: 2, done: ['month', 'week'], coachDone: { week: { id: 'w1', title: 'Email two piano teachers', saved: 'Saved to Week 40.', at: '' } } })
    show('/today', <Page target={null} extra={<>
      <button type="button" data-guide-target="today-choose" data-guide-id="other">+ Today</button>
      <button type="button" data-guide-target="today-choose" data-guide-id="w1">+ Today</button>
    </>} />)
    expect(screen.getByText('Choose “Email two piano teachers” for today.')).toBeTruthy()
    expect(document.querySelector('[data-guide-id="w1"]')!.getAttribute('data-guide-coach')).toBe('do')
    expect(document.querySelector('[data-guide-id="other"]')!.hasAttribute('data-guide-coach')).toBe(false)
    act(() => h.tasks.put([{ ...weekTask, plannedOn: new Date(2026, 8, 29), scheduledFor: new Date(2026, 8, 29), bucket: 'timed' }]))
    await waitFor(() => expect(coach()!.textContent).toContain('Saved to Today.'))
    expect(coach()!.textContent).toContain(`It’s still on ${WK()}.`)
  })

  it('the year: a goal saved for that year', async () => {
    h.guide.s.value = { ...monthRun({ coach: true }), route: 'bigger', steps: ['year', 'season', 'month', 'week', 'today'], periods: { year: '2026-01-01', season: '2026-10-01', month: '2026-10-01', week: '2026-09-26', today: '2026-09-29' } }
    show('/year?start=2026-01-01', <Page label="Add to 2026" />)
    expect(screen.getByText('Write one thing for 2026.')).toBeTruthy()
    act(() => h.goalListeners.forEach((f) => f({ id: 'g0', name: 'Next year', year: 2027 })))
    expect(set).not.toHaveBeenCalled()
    act(() => h.goalListeners.forEach((f) => f({ id: 'g1', name: 'Get healthy', year: 2026 })))
    await waitFor(() => expect(coach()!.textContent).toContain('Saved to 2026.'))
  })

  it('off the step’s page it stays out of the way', () => {
    h.guide.s.value = monthRun({ coach: true })
    show('/inbox')
    expect(coach()).toBeNull()
  })
})
