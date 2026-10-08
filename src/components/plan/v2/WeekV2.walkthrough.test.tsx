// Walkthrough 2026-10-08 (Scott, live): the Week page's month links, rapid
// entry, and what happens to unfinished work. Generic fixtures only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { Task } from '@/types/task'

const h = vi.hoisted(() => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  keepForward: vi.fn(),
  dropCommitment: vi.fn(),
  toggleTask: vi.fn(),
  gatedUpdate: vi.fn(),
  toast: vi.fn(),
}))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: h.toggleTask, updateTask: h.updateTask, pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: h.keepForward, dropCommitment: h.dropCommitment, addTask: h.addTask, deleteTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: h.gatedUpdate, pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('@/hooks/useToast', () => ({ showToast: h.toast }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: null, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'

// These tests cover the Lists view; Open journal is the default since
// 2026-10-08, so they make the device's choice explicit.
beforeEach(() => { localStorage.setItem('symphony-plan-layout.week', 'lists'); localStorage.setItem('symphony-plan-layout.month', 'lists') })


const WEEK = new Date(2026, 9, 3) // Sat Oct 3 – Fri Oct 9
const PREV = new Date(2026, 8, 26)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 5, 12))
  for (const f of Object.values(h)) f.mockReset()
  h.addTask.mockResolvedValue('new-id'); h.updateTask.mockResolvedValue(true); h.keepForward.mockResolvedValue('kept-id')
  h.dropCommitment.mockResolvedValue(true); h.gatedUpdate.mockResolvedValue(true); h.toggleTask.mockResolvedValue(true)
  localStorage.setItem('symphony-week-ref', 'open')
})
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const task = (o: Partial<Task>) => ({ completed: false, createdAt: new Date(2026, 8, 1), assignedTo: 'me', ...o }) as Task
const month = (id: string, title: string) => task({ id, title, bucket: 'month', monthStart: new Date(2026, 9, 1) })
const weekItem = (id: string, title: string, o: Partial<Task> = {}) =>
  task({ id, title, bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...o })
const TRIP = month('m1', 'Plan the autumn trip')
const SHED = month('m2', 'Clear out the shed')

let lastDays: Record<string, unknown> = {}
const renderDays = (o: Record<string, unknown>) => { lastDays = o; return <p>days</p> }
const ui = (tasks: Task[], weekStart = WEEK) => <MemoryRouter><WeekV2 tasks={tasks} weekStart={weekStart} meId="me" isCurrent={weekStart === WEEK} renderDays={renderDays} onSelectTask={vi.fn()} /></MemoryRouter>
const input = () => screen.getByLabelText('Add to this week') as HTMLInputElement
const type = (v: string) => fireEvent.change(input(), { target: { value: v } })
const enter = () => fireEvent.submit(input().closest('form')!)
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

describe('rapid weekly actions for one month line', () => {
  it('“Add a weekly action” chooses the line, lights it, and puts the cursor in the box', () => {
    render(ui([TRIP, SHED]))
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly action for Plan the autumn trip' }))
    expect(document.activeElement).toBe(input())
    expect(screen.getByText(/Adding for October:/)).toHaveTextContent('Adding for October: Plan the autumn trip')
    const ref = screen.getByRole('complementary', { name: 'October, for reference' })
    expect(within(ref).getByText('Plan the autumn trip').closest('li')).toHaveAttribute('data-chosen', 'true')
    expect(screen.getByRole('button', { name: 'Adding weekly actions for Plan the autumn trip' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('several Enters in a row share the line, stay distinct, and keep the cursor in the box', async () => {
    render(ui([TRIP, SHED]))
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly action for Plan the autumn trip' }))
    for (const t of ['Book the cabin', 'Ask about time off']) {
      type(t); enter()
      await waitFor(() => expect(input().value).toBe(''))
      expect(document.activeElement).toBe(input())
    }
    expect(h.addTask.mock.calls.map((c) => [c[0], c[4].sourceId])).toEqual([['Book the cabin', 'm1'], ['Ask about time off', 'm1']])
    expect(screen.getByText(/Adding for October:/)).toHaveTextContent('Plan the autumn trip')
  })

  it('switching the line changes only what comes next; Clear goes back to unlinked', async () => {
    render(ui([TRIP, SHED]))
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly action for Plan the autumn trip' }))
    type('Book the cabin'); enter(); await waitFor(() => expect(input().value).toBe(''))
    fireEvent.change(screen.getByLabelText('For an October line'), { target: { value: 'm2' } })
    type('Order a skip'); enter(); await waitFor(() => expect(input().value).toBe(''))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(document.activeElement).toBe(input())
    type('Water the plants'); enter(); await waitFor(() => expect(input().value).toBe(''))
    expect(h.addTask.mock.calls.map((c) => c[4].sourceId)).toEqual(['m1', 'm2', undefined])
  })

  it('a slow save keeps words typed meanwhile, shows it is saving, and ignores a second Enter', async () => {
    const d = deferred<string>()
    h.addTask.mockReturnValueOnce(d.promise)
    render(ui([TRIP]))
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly action for Plan the autumn trip' }))
    type('Book the cabin'); enter()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Saving…')
    enter() // a second Enter while saving
    type('Ask about time off') // the next action, typed before the first save returns
    await act(async () => { d.resolve('saved-id'); await d.promise })
    expect(h.addTask).toHaveBeenCalledTimes(1)
    expect(input().value).toBe('Ask about time off')
    expect(screen.queryByText('Saving…')).toBeNull()
  })

  it('a failed save keeps the words and says so', async () => {
    h.addTask.mockResolvedValueOnce(undefined)
    render(ui([TRIP]))
    type('Book the cabin'); enter()
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t save — your words are still in the box.')
    expect(input().value).toBe('Book the cabin')
  })

  it('a chosen line that is no longer on offer (another week, a filter, done) is never reused', async () => {
    const { rerender } = render(ui([TRIP, SHED]))
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly action for Plan the autumn trip' }))
    rerender(ui([SHED]))
    expect(screen.getByText(/Not tied to an October line/)).toBeInTheDocument()
    type('Order a skip'); enter(); await waitFor(() => expect(input().value).toBe(''))
    expect(h.addTask.mock.calls[0][4].sourceId).toBeUndefined()
    // Back on screen: still not chosen — it was dropped, not hidden.
    rerender(ui([TRIP, SHED]))
    expect(screen.getByText(/Not tied to an October line/)).toBeInTheDocument()
  })

  it('a different week starts with nothing chosen', () => {
    const { rerender } = render(ui([TRIP]))
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly action for Plan the autumn trip' }))
    const next = new Date(2026, 9, 10)
    rerender(ui([TRIP], next))
    rerender(ui([TRIP]))
    expect(screen.queryByText(/Adding for October:/)).toBeNull()
  })
})

describe('changing an existing weekly action’s month line', () => {
  it('links an item written without one, on the same row — only the link is written', async () => {
    render(ui([TRIP, SHED, weekItem('w1', 'Go through the onboarding')]))
    fireEvent.click(screen.getByRole('button', { name: 'Link Go through the onboarding to an October line' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plan the autumn trip' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w1', { sourceId: 'm1' }))
    // Undo puts back exactly what was there.
    const undo = h.toast.mock.calls.at(-1)![3]
    undo.onClick()
    expect(h.updateTask).toHaveBeenLastCalledWith('w1', { sourceId: undefined })
  })

  it('changes and removes a link from the row’s ⋯ menu too', async () => {
    render(ui([TRIP, SHED, weekItem('w2', 'Book the cabin', { sourceId: 'm1' })]))
    fireEvent.click(screen.getByRole('button', { name: 'More for Book the cabin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Change October line/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Clear out the shed' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w2', { sourceId: 'm2' }))
    fireEvent.click(screen.getByRole('button', { name: /^For October: Plan the autumn trip/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Remove the October link' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenLastCalledWith('w2', { sourceId: undefined }))
  })

  it('removes an older row’s goal_task_id link even when that line is not on offer this month', async () => {
    const sept = task({ id: 'old', title: 'Sort the paperwork', bucket: 'month', monthStart: new Date(2026, 8, 1) })
    render(ui([TRIP, sept, weekItem('w3', 'File the receipts', { goalTaskId: 'old' })]))
    fireEvent.click(screen.getByRole('button', { name: /^For September: Sort the paperwork/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Remove the October link' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w3', { goalTaskId: undefined }))
  })

  it('a row written for one line and a step of another loses only the written link, and says what still shows', async () => {
    const goal = month('g9', 'Host the family dinner')
    render(ui([TRIP, goal, weekItem('w4', 'Buy candles', { sourceId: 'm1', goalTaskId: 'g9' })]))
    fireEvent.click(screen.getByRole('button', { name: /^For October: Plan the autumn trip/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Remove the October link' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w4', { sourceId: undefined }))
    expect(h.toast.mock.calls.at(-1)![0]).toMatch(/still a step of “Host the family dinner”/)
  })

  it('the days get the same control for week items only', () => {
    const item = weekItem('w5', 'Call the plumber', { scheduledFor: new Date(2026, 9, 8), isAllDay: true })
    render(ui([TRIP, item]))
    const control = (lastDays.forControl as (t: Task) => ReactElement | null)
    expect(control(item)).not.toBeNull()
    expect(control(TRIP)).toBeNull()
    expect(control(task({ id: 'r', title: 'Dentist', bucket: 'timed', scheduledFor: new Date(2026, 9, 8) }))).toBeNull()
  })
})

describe('unfinished work: said truthfully, and resurfaced by the look-back', () => {
  const left = task({ id: 'l1', title: 'Talk through the holiday plans', bucket: 'week', weekStart: PREV, commitments: [{ level: 'week', periodStart: PREV, status: 'open' }] })

  it('last week’s open item is not on this week’s list, and the page says it is waiting for a decision', () => {
    render(ui([left]))
    expect(within(screen.getByRole('region', { name: "This week's list" })).queryByText('Talk through the holiday plans')).toBeNull()
    expect(screen.getByText(/Last week left one thing open\. Nothing has moved on its own\./)).toBeInTheDocument()
  })

  it('the look-back carries it in with an explicit write', async () => {
    render(ui([left]))
    fireEvent.click(screen.getByRole('button', { name: /Decide what happens to it/ }))
    expect(screen.getByText('Talk through the holiday plans')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    await waitFor(() => expect(h.keepForward).toHaveBeenCalledWith('l1', { weekStart: WEEK }, PREV))
  })

  it('a carry that fails (keepForward resolves undefined) stays on its card, uncounted, and can be tried again', async () => {
    h.keepForward.mockResolvedValueOnce(undefined)
    render(ui([left]))
    fireEvent.click(screen.getByRole('button', { name: /Decide what happens to it/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t fully save, so it isn’t counted as decided.')
    expect(screen.getByText('Talk through the holiday plans')).toBeInTheDocument()
    expect(screen.queryByText(/is closed/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    await waitFor(() => expect(h.keepForward).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('a half-landed carry (kept forward, old day not cleared) keeps its card after the row leaves last week, and a retry finishes only the rest', async () => {
    const dated = task({ ...left, scheduledFor: new Date(2026, 8, 29), isAllDay: true })
    h.gatedUpdate.mockResolvedValueOnce(false)
    const { rerender } = render(ui([dated]))
    fireEvent.click(screen.getByRole('button', { name: /Decide what happens to it/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('didn’t fully save')
    expect(h.keepForward).toHaveBeenCalledTimes(1)
    // What the first write did arrives: last week's commitment carried, this
    // week's open — the row is no longer on last week's list.
    const moved = task({ ...dated, weekStart: WEEK, commitments: [{ level: 'week', periodStart: PREV, status: 'carried', carriedTo: WEEK }, { level: 'week', periodStart: WEEK, status: 'open' }] })
    rerender(ui([moved]))
    expect(screen.getByText('Talk through the holiday plans')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalledTimes(2))
    expect(h.keepForward).toHaveBeenCalledTimes(1) // not carried twice
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('explains what happens to this week’s open work without promising a silent roll-forward', () => {
    render(ui([weekItem('w6', 'Ring the garage')]))
    fireEvent.click(screen.getByText('Not finished by Friday?'))
    const note = screen.getByRole('note', { name: 'What happens to unfinished work' })
    expect(note).toHaveTextContent('nothing moves by itself')
    expect(note).toHaveTextContent('Last week asks about each open one')
    expect(note).toHaveTextContent('a day named in its title isn’t a scheduled day')
    expect(note).not.toHaveTextContent(/automatically/i)
  })

  it('names the exception: an older item with no week of its own stays on the current week', () => {
    render(ui([task({ id: 'u1', title: 'Fix the gate', bucket: 'week' })]))
    fireEvent.click(screen.getByText('Not finished by Friday?'))
    expect(screen.getByText(/One older item here has no week of its own/)).toBeInTheDocument()
  })
})
