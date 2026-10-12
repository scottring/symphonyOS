// Planning the week in Scott's four steps (2026-10-12): Inbox, Last week,
// Monthly goals, Days & times — one weekly list, anchored, built through all
// four; the source beside it changes. Generic fixtures only.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { readCadenceConfig } from '@/lib/cadence/config'
import { sessionProgressKey } from '@/hooks/useSessionProgress'
import { WeekJournal, type JournalDay } from '@/components/home/week/WeekJournal'
import type { DaysOptions } from './WeekV2'

const h = vi.hoisted(() => ({
  addTask: vi.fn(), updateTask: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), toggleTask: vi.fn(), deleteTask: vi.fn(),
  gatedUpdate: vi.fn(), toast: vi.fn(),
}))
const session = {
  saved: null as null | { at: Date; authorId: string; notes: { focus?: string } }, mine: null, loading: false, loadedToken: '', error: null,
  reload: vi.fn(), save: vi.fn(),
}
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => session,
  weekToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({
  toggleTask: h.toggleTask, updateTask: h.updateTask, pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: h.keepForward,
  dropCommitment: h.dropCommitment, addTask: h.addTask, deleteTask: h.deleteTask, loading: false,
}) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: h.gatedUpdate, pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('@/hooks/useToast', () => ({ showToast: h.toast }))
const dayPlan = vi.hoisted(() => ({ plan: null as null | { unfinished: unknown[] } }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: dayPlan.plan, loading: false, error: false }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('./WeekStepScreen', () => ({ WeekStepMain: ({ step }: { step: string }) => <p>reference: {step}</p> }))

import { WeekV2, type WeekCanvasHost } from './WeekV2'

// Today is Monday Oct 12, 2026; the coming week is Sat Oct 17 – Fri Oct 23
// (the household's Saturday week — never a hardcoded Monday).
const TODAY = new Date(2026, 9, 12, 12)
const WEEK = new Date(2026, 9, 17)
const PREV = new Date(2026, 9, 10)
const N = weekOfYear(WEEK, readCadenceConfig().weekStartsOn)
const WK = `week ${N}`

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(TODAY)
  for (const f of Object.values(h)) f.mockReset()
  h.addTask.mockResolvedValue('new-id'); h.updateTask.mockResolvedValue(true); h.keepForward.mockResolvedValue('l1')
  h.dropCommitment.mockResolvedValue(true); h.gatedUpdate.mockResolvedValue(true); h.toggleTask.mockResolvedValue(true)
  session.saved = null; session.save.mockReset()
  dayPlan.plan = null
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const task = (o: Partial<Task>) => ({ completed: false, createdAt: new Date(2026, 9, 1), assignedTo: 'me', ...o }) as Task
const goal = (id: string, title: string, month = new Date(2026, 9, 1), o: Partial<Task> = {}) => task({ id, title, bucket: 'month', monthStart: month, ...o })
const weekItem = (id: string, title: string, o: Partial<Task> = {}, at = WEEK) =>
  task({ id, title, bucket: 'week', weekStart: at, commitments: [{ level: 'week', periodStart: at, status: 'open' }], ...o })

const CAPTURE = task({ id: 'c1', title: 'Call the dentist', bucket: 'inbox', createdAt: new Date(2026, 9, 11) })
const TRIP = goal('m1', 'Plan the autumn trip')
const SHED = goal('m2', 'Clear out the shed')
const CABIN = weekItem('w1', 'Book the cabin', { sourceId: 'm1' })
const LEFT = weekItem('l1', 'Talk through the holiday plans', {}, PREV)
const DRILL = weekItem('l2', 'Return the drill', { completed: true }, PREV)
const ALL = [CAPTURE, TRIP, SHED, CABIN, LEFT, DRILL]

let lastDays: DaysOptions | null = null
const stubDays = (o: DaysOptions) => { lastDays = o; return <div data-testid="days-grid">{o.variant ?? o.show ?? 'grid'}</div> }
const canvas = (host: WeekCanvasHost) => <button type="button" onClick={host.onLookBack}>From last week · Review</button>
const ui = (tasks: Task[] = ALL, weekStart = WEEK, renderDays = stubDays) => (
  <MemoryRouter><DndContext>
    <WeekV2 tasks={tasks} weekStart={weekStart} meId="me" isCurrent={false} renderDays={renderDays} onSelectTask={vi.fn()} canvas={canvas} />
  </DndContext></MemoryRouter>
)

const bar = () => within(screen.getByRole('region', { name: /^Planning week/ }))
const stepButtons = () => bar().getAllByRole('button').filter((b) => b.closest('.pv2-steps'))
const current = () => stepButtons().find((b) => b.getAttribute('aria-current') === 'step')?.textContent
const goTo = (label: string) => fireEvent.click(stepButtons().find((b) => b.textContent?.endsWith(label))!)
const plan = () => fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
const list = () => screen.getByRole('region', { name: 'This week\'s list' })
const source = () => document.getElementById('wk-board-source')!
const addBox = () => screen.getByLabelText('Add to this week') as HTMLInputElement

describe('the four steps, in Scott’s order', () => {
  it('Plan the week opens on Inbox; the steps are Inbox, Last week, Monthly goals, Days & times', () => {
    render(ui())
    plan()
    expect(stepButtons().map((b) => b.textContent)).toEqual(['1Inbox', '2Last week', '3Monthly goals', '4Days & times'])
    expect(current()).toBe('1Inbox')
    // One primary at a time: Next through the steps, marking planned only on the last.
    for (const next of ['Last week', 'Monthly goals', 'Days & times']) {
      expect(bar().queryByRole('button', { name: `Mark week ${N} planned` })).toBeNull()
      fireEvent.click(bar().getByRole('button', { name: `Next: ${next} →` }))
      expect(current()).toMatch(new RegExp(`${next}$`))
    }
    expect(bar().queryByRole('button', { name: /^Next:/ })).toBeNull()
    expect(bar().getByRole('button', { name: `Mark week ${N} planned` })).toBeInTheDocument()
  })

  it('the old eight steps are gone: no Between us, Can’t move, Look ahead, Routines or Write the week step', () => {
    render(ui())
    plan()
    const labels = stepButtons().map((b) => b.textContent ?? '')
    for (const old of ['Between us', 'Can’t move', 'Look ahead', 'Routines', 'Write the week', 'The week']) expect(labels.some((l) => l.endsWith(old))).toBe(false)
  })

  it('the weekly list is the same element, with the same rows, in every step; only the source beside it changes', () => {
    render(ui())
    plan()
    const anchored = list()
    const sources: string[] = []
    for (const s of ['Inbox', 'Last week', 'Monthly goals', 'Days & times']) {
      goTo(s)
      expect(list()).toBe(anchored)
      expect(within(anchored).getByText('Book the cabin')).toBeInTheDocument()
      sources.push(within(source()).getAllByRole('heading', { level: 2 })[0].textContent!)
    }
    expect(sources).toEqual(['Inbox', 'Last week', 'October goals', 'The days'])
  })
})

describe('1 · Inbox', () => {
  it('choosing a capture writes the same row into the week, and it joins the list with a brief “From Inbox”', async () => {
    const { rerender } = render(ui())
    plan()
    expect(within(source()).getByText('Call the dentist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Add Call the dentist to ${WK}` }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalledWith('c1', { bucket: 'week', weekStart: WEEK }))
    expect(h.addTask).not.toHaveBeenCalled()
    // The write arrives: the capture is now the week's.
    const moved = weekItem('c1', 'Call the dentist', { createdAt: CAPTURE.createdAt })
    rerender(ui([moved, TRIP, SHED, CABIN, LEFT, DRILL]))
    const row = within(list()).getByText('Call the dentist').closest('li')!
    expect(row).toHaveClass('is-added')
    expect(within(row).getByText('From Inbox')).toBeInTheDocument()
    expect(within(source()).queryByText('Call the dentist')).toBeNull()
  })

  it('an add that did not save says so, and the capture stays in the Inbox to try again', async () => {
    h.gatedUpdate.mockResolvedValueOnce(false)
    render(ui())
    plan()
    fireEvent.click(screen.getByRole('button', { name: `Add Call the dentist to ${WK}` }))
    expect(await within(source()).findByRole('alert')).toHaveTextContent('Not added. It’s still in your Inbox — try again.')
    expect(within(list()).queryByText('Call the dentist')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Add Call the dentist to ${WK}` }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(source()).queryByRole('alert')).toBeNull())
  })
})

describe('2 · Last week', () => {
  it('nothing comes over by itself: opening the step, leaving and finishing write nothing', async () => {
    session.save.mockResolvedValue(true)
    render(ui())
    plan()
    goTo('Last week')
    expect(within(source()).getByText('Talk through the holiday plans')).toBeInTheDocument()
    expect(within(list()).queryByText('Talk through the holiday plans')).toBeNull()
    goTo('Days & times')
    await act(async () => { fireEvent.click(bar().getByRole('button', { name: `Mark week ${N} planned` })) })
    expect(h.keepForward).not.toHaveBeenCalled()
    expect(h.gatedUpdate).not.toHaveBeenCalled()
    expect(h.addTask).not.toHaveBeenCalled()
  })

  it('bringing one forward carries the same row: last week keeps its record, no new row is made', async () => {
    const { rerender } = render(ui())
    plan()
    goTo('Last week')
    fireEvent.click(screen.getByRole('button', { name: `Bring Talk through the holiday plans into ${WK}` }))
    await waitFor(() => expect(h.keepForward).toHaveBeenCalledWith('l1', { weekStart: WEEK }, PREV))
    expect(h.addTask).not.toHaveBeenCalled()
    // What the carry wrote: last week's commitment carried (history kept), this week's open.
    const carried = task({ ...LEFT, weekStart: WEEK, commitments: [{ level: 'week', periodStart: PREV, status: 'carried', carriedTo: WEEK }, { level: 'week', periodStart: WEEK, status: 'open' }] })
    rerender(ui([CAPTURE, TRIP, SHED, CABIN, carried, DRILL]))
    expect(within(list()).getAllByText('Talk through the holiday plans')).toHaveLength(1)
    expect(within(within(list()).getByText('Talk through the holiday plans').closest('li')!).getByText('From last week')).toBeInTheDocument()
    const card = within(source()).getByRole('region', { name: 'Talk through the holiday plans' })
    expect(within(card).getByText('Brought forward')).toBeInTheDocument()
    expect(within(card).getByText(/Last week’s record keeps it/)).toBeInTheDocument()
    // Done last week stays as its record.
    expect(within(source()).getByRole('list', { name: 'Done last week' })).toHaveTextContent('Return the drill')
  })

  it('a carry that did not save stays undecided on its card and can be tried again', async () => {
    h.keepForward.mockResolvedValueOnce(undefined)
    render(ui())
    plan()
    goTo('Last week')
    fireEvent.click(screen.getByRole('button', { name: `Bring Talk through the holiday plans into ${WK}` }))
    expect(await within(source()).findByRole('alert')).toHaveTextContent('That didn’t save, so it isn’t decided.')
    expect(within(source()).queryByText('Brought forward')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Bring Talk through the holiday plans into ${WK}` }))
    await waitFor(() => expect(h.keepForward).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(source()).queryByRole('alert')).toBeNull())
  })

  it('“Let go” lets go of last week’s commitment only; “Leave it” writes nothing', async () => {
    const other = weekItem('l3', 'Fix the gate', {}, PREV)
    render(ui([...ALL, other]))
    plan()
    goTo('Last week')
    fireEvent.click(screen.getByRole('button', { name: 'Leave Fix the gate where it is' }))
    expect(h.dropCommitment).not.toHaveBeenCalled()
    expect(within(within(source()).getByRole('region', { name: 'Fix the gate' })).getByText('Left where it was')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Let go of Talk through the holiday plans' }))
    await waitFor(() => expect(h.dropCommitment).toHaveBeenCalledWith('l1', 'week', PREV))
  })
})

describe('3 · Monthly goals', () => {
  it('a week across a month end shows both months’ goals, through the page’s people scope', () => {
    const BOUNDARY = new Date(2026, 9, 31) // Sat Oct 31 – Fri Nov 6
    const nov = goal('n1', 'Book the flu shots', new Date(2026, 10, 1))
    const theirs = goal('n2', 'Iris’s private goal', new Date(2026, 10, 1), { assignedTo: 'iris' })
    render(ui([TRIP, nov, theirs], BOUNDARY))
    plan()
    goTo('Monthly goals')
    expect(within(source()).getByRole('heading', { level: 2 })).toHaveTextContent('October and November goals')
    expect(within(source()).getByRole('list', { name: 'October goals' })).toHaveTextContent('Plan the autumn trip')
    expect(within(source()).getByRole('list', { name: 'November goals' })).toHaveTextContent('Book the flu shots')
    expect(within(source()).queryByText('Iris’s private goal')).toBeNull()
  })

  it('selecting a goal highlights its tasks in the list (never filters) and previews the same records', () => {
    render(ui([...ALL, weekItem('w2', 'Water the plants')]))
    plan()
    goTo('Monthly goals')
    fireEvent.click(within(source()).getByRole('button', { name: 'Plan the autumn trip' }))
    expect(within(list()).getByText('Book the cabin').closest('li')).toHaveClass('is-related')
    expect(within(list()).getByText('Water the plants').closest('li')).not.toHaveClass('is-related')
    expect(within(source()).getByRole('list', { name: `${WK} tasks for Plan the autumn trip` })).toHaveTextContent('Book the cabin')
    expect(within(source()).getByRole('region', { name: 'October goal: Plan the autumn trip' })).toHaveTextContent(`1 task ${WK}`)
  })

  it('adding a task for a goal is one write with the link; the goal is not touched; the task wears its parent label', async () => {
    h.addTask.mockResolvedValueOnce('w9')
    const { rerender } = render(ui())
    plan()
    goTo('Monthly goals')
    fireEvent.click(screen.getByRole('button', { name: `Add a task ${WK} for Clear out the shed` }))
    const box = screen.getByLabelText(`New task ${WK} for Clear out the shed`)
    fireEvent.change(box, { target: { value: 'Order a skip' } })
    fireEvent.submit(box.closest('form')!)
    await waitFor(() => expect(h.addTask).toHaveBeenCalledTimes(1))
    expect(h.addTask.mock.calls[0][0]).toBe('Order a skip')
    expect(h.addTask.mock.calls[0][4]).toMatchObject({ bucket: 'week', weekStart: WEEK, sourceId: 'm2' })
    expect(h.updateTask).not.toHaveBeenCalled()
    expect(h.gatedUpdate).not.toHaveBeenCalled()
    // The composer stays for the next one, its words cleared.
    await waitFor(() => expect((screen.getByLabelText(`New task ${WK} for Clear out the shed`) as HTMLInputElement).value).toBe(''))
    rerender(ui([...ALL, weekItem('w9', 'Order a skip', { sourceId: 'm2' })]))
    const row = within(list()).getByText('Order a skip').closest('li')!
    expect(within(row).getByRole('button', { name: /^For October: Clear out the shed/ })).toHaveTextContent('October goal Clear out the shed')
    expect(row).toHaveClass('is-linked')
    // The goal stays in the source as itself, once, now counting the task.
    expect(within(source()).getAllByText('Clear out the shed')).toHaveLength(1)
    expect(within(source()).getByRole('region', { name: 'October goal: Clear out the shed' })).toHaveTextContent(`1 task ${WK}`)
  })

  it('a goal-card add that did not save keeps the words', async () => {
    h.addTask.mockResolvedValueOnce(undefined)
    render(ui())
    plan()
    goTo('Monthly goals')
    fireEvent.click(screen.getByRole('button', { name: `Add a task ${WK} for Plan the autumn trip` }))
    const box = screen.getByLabelText(`New task ${WK} for Plan the autumn trip`) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'Ask about time off' } })
    fireEvent.submit(box.closest('form')!)
    expect(await screen.findByText('Didn’t save. Your wording is still here; try again.')).toBeInTheDocument()
    expect(box.value).toBe('Ask about time off')
  })

  it('an existing task is linked on the same row: only its link is written', async () => {
    render(ui([...ALL, weekItem('w3', 'Go through the onboarding')]))
    plan()
    goTo('Monthly goals')
    fireEvent.click(screen.getByRole('button', { name: 'Link Go through the onboarding to an October goal' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plan the autumn trip' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w3', { sourceId: 'm1' }))
    expect(h.addTask).not.toHaveBeenCalled()
  })
})

describe('4 · Days & times', () => {
  it('the days stand beside the list: the full grid, not a strip or the fixed-only view', () => {
    render(ui())
    plan()
    goTo('Days & times')
    expect(within(source()).getByTestId('days-grid')).toHaveTextContent('grid')
    expect(lastDays?.variant).toBeUndefined()
    expect(lastDays?.show).toBeUndefined()
    expect(within(list()).getByText('Book the cabin')).toBeInTheDocument()
  })

  it('shows the calendar’s commitments — events, routines and dated tasks — while the list stays whole, dated rows included', () => {
    const dated = weekItem('w4', 'Call the plumber', { scheduledFor: new Date(2026, 9, 20), isAllDay: true })
    const days: JournalDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(2026, 9, 17 + i)
      return { date, key: `2026-10-${17 + i}`, notes: [], entries: [], foldedRoutines: [], available: [], dinners: [] }
    })
    days[3].entries.push({ id: 'event-e1', kind: 'event', title: 'Dentist appointment', completed: false, time: new Date(2026, 9, 20, 9), end: new Date(2026, 9, 20, 10) })
    days[3].entries.push({ id: 'task-w4', kind: 'task', title: 'Call the plumber', completed: false, task: dated })
    days[4].foldedRoutines.push({ id: 'routine-r1-day', kind: 'routine', title: 'Piano practice', completed: false, routineId: 'r1' })
    const realDays = (o: DaysOptions) => <WeekJournal layout="grid" days={days} weekend={{ satIndex: 0, sunIndex: 1, sometime: [] }} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} {...o} />
    render(ui([...ALL, dated], WEEK, realDays))
    plan()
    goTo('Days & times')
    const cal = within(source())
    expect(cal.getByText('Dentist appointment')).toBeInTheDocument()
    expect(cal.getByText('Piano practice')).toBeInTheDocument()
    expect(cal.getByText('Call the plumber')).toBeInTheDocument()
    // The dated task stays on the complete list, saying its day.
    const row = within(list()).getByText('Call the plumber').closest('li')!
    expect(row).toHaveTextContent('On Tuesday')
  })

  it('routines and what’s coming up are optional reference, folded inside the step', () => {
    render(ui())
    plan()
    goTo('Days & times')
    expect(screen.queryByText('reference: routines')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Routines this week' }))
    expect(screen.getByText('reference: routines')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Coming up after this week' }))
    expect(screen.getByText('reference: ahead')).toBeInTheDocument()
  })
})

describe('reference hide / show', () => {
  it('hiding the source keeps an unfinished draft and moves nothing; showing it brings the same words back', () => {
    render(ui())
    plan()
    goTo('Monthly goals')
    fireEvent.click(screen.getByRole('button', { name: `Add a task ${WK} for Plan the autumn trip` }))
    const box = screen.getByLabelText(`New task ${WK} for Plan the autumn trip`) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'Half a thought' } })
    fireEvent.change(addBox(), { target: { value: 'Ring the garage' } })
    const anchored = list()
    fireEvent.click(screen.getByRole('button', { name: 'Hide October goals' }))
    expect(source()).toHaveAttribute('hidden')
    expect(box.isConnected).toBe(true) // hidden, not unmounted
    expect(list()).toBe(anchored)
    fireEvent.click(screen.getByRole('button', { name: 'Show October goals' }))
    expect(source()).not.toHaveAttribute('hidden')
    expect((screen.getByLabelText(`New task ${WK} for Plan the autumn trip`) as HTMLInputElement).value).toBe('Half a thought')
    expect(addBox().value).toBe('Ring the garage')
    expect(h.addTask).not.toHaveBeenCalled()
  })
})

describe('leaving, resuming and finishing', () => {
  it('Leave for now, then a fresh page (a reload): Continue planning returns to the saved step with the unfinished words', () => {
    const first = render(ui())
    plan()
    goTo('Monthly goals')
    fireEvent.change(addBox(), { target: { value: 'Ring the garage' } })
    fireEvent.click(bar().getByRole('button', { name: 'Leave for now' }))
    expect(screen.queryByRole('region', { name: /^Planning week/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue planning' })).toBeInTheDocument()
    first.unmount()
    render(ui())
    expect(screen.queryByRole('button', { name: 'Plan the week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(current()).toBe('3Monthly goals')
    expect(addBox().value).toBe('Ring the garage')
  })

  it('a decision made before leaving is still shown when the session resumes', async () => {
    const first = render(ui())
    plan()
    goTo('Last week')
    fireEvent.click(screen.getByRole('button', { name: 'Leave Talk through the holiday plans where it is' }))
    fireEvent.click(bar().getByRole('button', { name: 'Leave for now' }))
    first.unmount()
    render(ui())
    fireEvent.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(current()).toBe('2Last week')
    expect(within(source()).getByText('Left where it was')).toBeInTheDocument()
  })

  it('“Review last week” opens the session straight on step 2, from the toolbar and from the canvas', () => {
    const first = render(ui())
    fireEvent.click(screen.getByRole('button', { name: 'Review last week' }))
    expect(current()).toBe('2Last week')
    first.unmount(); localStorage.clear()
    render(ui())
    fireEvent.click(screen.getByRole('button', { name: 'From last week · Review' }))
    expect(current()).toBe('2Last week')
  })

  it('another week keeps its own progress', () => {
    const OTHER = new Date(2026, 9, 24)
    const { rerender } = render(ui())
    plan()
    goTo('Monthly goals')
    fireEvent.click(bar().getByRole('button', { name: 'Leave for now' }))
    rerender(ui(ALL, OTHER))
    expect(screen.queryByRole('button', { name: 'Continue planning' })).toBeNull()
    plan()
    expect(current()).toBe('1Inbox')
    fireEvent.click(bar().getByRole('button', { name: 'Leave for now' }))
    rerender(ui(ALL, WEEK))
    fireEvent.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(current()).toBe('3Monthly goals')
  })

  it('finishing marks the week planned and shows what it holds; the session’s progress is cleared', async () => {
    session.save.mockResolvedValue(true)
    const dated = weekItem('w4', 'Call the plumber', { scheduledFor: new Date(2026, 9, 20), isAllDay: true })
    render(ui([...ALL, dated]))
    plan()
    goTo('Days & times')
    fireEvent.change(screen.getByLabelText('This week is for…'), { target: { value: 'Keep Tuesday light' } })
    await act(async () => { fireEvent.click(bar().getByRole('button', { name: `Mark week ${N} planned` })) })
    expect(session.save).toHaveBeenCalledWith(expect.objectContaining({ focus: 'Keep Tuesday light' }))
    expect(screen.queryByRole('region', { name: /^Planning week/ })).toBeNull()
    const held = screen.getByRole('region', { name: `What week ${N} holds` })
    expect(within(held).getByRole('list', { name: 'On a day' })).toHaveTextContent('Call the plumber')
    expect(within(held).getByRole('list', { name: 'Any day' })).toHaveTextContent('Book the cabin')
    expect(screen.getByText(`Week ${N} is planned.`)).toBeInTheDocument()
    expect(localStorage.getItem(sessionProgressKey('me', 'weekly', `${WEEK.getFullYear()}-${WEEK.getMonth() + 1}-${WEEK.getDate()}`))).toBeNull()
    // Nothing left to continue: the next visit starts afresh.
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('button', { name: 'Continue planning' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Plan the week' })).toBeInTheDocument()
  })

  it('a save that fails says “didn’t save” and keeps the session, its step and its words', async () => {
    session.save.mockResolvedValue(false)
    render(ui())
    plan()
    goTo('Days & times')
    fireEvent.change(screen.getByLabelText('This week is for…'), { target: { value: 'Keep Tuesday light' } })
    fireEvent.change(addBox(), { target: { value: 'Ring the garage' } })
    await act(async () => { fireEvent.click(bar().getByRole('button', { name: `Mark week ${N} planned` })) })
    expect(screen.getByRole('alert')).toHaveTextContent(`That didn’t save — week ${N} isn’t marked planned yet.`)
    expect(current()).toBe('4Days & times')
    expect((screen.getByLabelText('This week is for…') as HTMLInputElement).value).toBe('Keep Tuesday light')
    expect(addBox().value).toBe('Ring the garage')
  })
})

describe('the list’s own add box, in any step', () => {
  it('adds a task of its own; a failed save keeps the words and says so', async () => {
    h.addTask.mockResolvedValueOnce(undefined)
    render(ui())
    plan()
    fireEvent.change(addBox(), { target: { value: 'Book the cabin deposit' } })
    fireEvent.submit(addBox().closest('form')!)
    expect(await screen.findByText('That didn’t save — your words are still in the box. Press Enter to try again.')).toBeInTheDocument()
    expect(addBox().value).toBe('Book the cabin deposit')
    fireEvent.submit(addBox().closest('form')!)
    await waitFor(() => expect(addBox().value).toBe(''))
    expect(h.addTask.mock.calls[1][4]).toMatchObject({ bucket: 'week', weekStart: WEEK })
    expect(h.addTask.mock.calls[1][4].sourceId).toBeUndefined()
  })

  it('an optional month goal from the picker goes in the same write', async () => {
    render(ui())
    plan()
    fireEvent.change(screen.getByLabelText('For an October goal'), { target: { value: 'm1' } })
    fireEvent.change(addBox(), { target: { value: 'Ask about time off' } })
    fireEvent.submit(addBox().closest('form')!)
    await waitFor(() => expect(h.addTask).toHaveBeenCalledTimes(1))
    expect(h.addTask.mock.calls[0][4].sourceId).toBe('m1')
  })
})

describe('carry logic, kept from the look-back', () => {
  it('a half-landed carry (kept forward, old day not cleared) keeps its card, and a retry finishes only the rest', async () => {
    const dated = task({ ...LEFT, scheduledFor: new Date(2026, 9, 13), isAllDay: true })
    h.gatedUpdate.mockResolvedValueOnce(false)
    const { rerender } = render(ui([CAPTURE, TRIP, dated]))
    plan()
    goTo('Last week')
    fireEvent.click(screen.getByRole('button', { name: `Bring Talk through the holiday plans into ${WK}` }))
    expect(await within(source()).findByRole('alert')).toHaveTextContent('didn’t save')
    expect(h.keepForward).toHaveBeenCalledTimes(1)
    // What the first write did arrives: the row has left last week's list.
    const moved = task({ ...dated, weekStart: WEEK, commitments: [{ level: 'week', periodStart: PREV, status: 'carried', carriedTo: WEEK }, { level: 'week', periodStart: WEEK, status: 'open' }] })
    rerender(ui([CAPTURE, TRIP, moved]))
    expect(within(source()).getByText('Talk through the holiday plans')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Bring Talk through the holiday plans into ${WK}` }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalledTimes(2))
    expect(h.keepForward).toHaveBeenCalledTimes(1) // not carried twice
    await waitFor(() => expect(within(source()).queryByRole('alert')).toBeNull())
  })

  it('earlier unfinished work comes in as the week’s, any day (lineDropUpdates), under “Earlier, still open”', async () => {
    const old = task({ id: 'e1', title: 'Renew the passport', bucket: 'week', weekStart: new Date(2026, 8, 26), scheduledFor: new Date(2026, 8, 29), isAllDay: true })
    dayPlan.plan = { unfinished: [{ task: old, completed: false, context: 'Missed on Tue Sep 29' }] }
    render(ui([TRIP, old]))
    plan()
    goTo('Last week')
    const earlier = within(source()).getByRole('list', { name: 'Earlier, still open' })
    expect(earlier).toHaveTextContent('Renew the passport')
    expect(earlier).toHaveTextContent('Earlier: Missed on Tue Sep 29')
    fireEvent.click(screen.getByRole('button', { name: `Bring Renew the passport into ${WK}` }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalledWith('e1', expect.objectContaining({ bucket: 'week', weekStart: WEEK, scheduledFor: undefined })))
    expect(h.keepForward).not.toHaveBeenCalled()
  })
})

describe('month links on the list and the days', () => {
  it('removes an older row’s goal_task_id link even when that goal is not on offer this month', async () => {
    const sept = goal('old', 'Sort the paperwork', new Date(2026, 8, 1))
    render(ui([TRIP, sept, weekItem('w3', 'File the receipts', { goalTaskId: 'old' })]))
    plan()
    fireEvent.click(screen.getByRole('button', { name: /^For September: Sort the paperwork/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Remove the October link' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w3', { goalTaskId: undefined }))
  })

  it('the days get the same control, for week tasks only — never for a month goal or a timed appointment', () => {
    const item = weekItem('w5', 'Call the plumber', { scheduledFor: new Date(2026, 9, 20), isAllDay: true })
    render(ui([TRIP, item]))
    plan()
    goTo('Days & times')
    const control = lastDays!.forControl!
    expect(control(item)).not.toBeNull()
    expect(control(TRIP)).toBeNull()
    expect(control(task({ id: 'r', title: 'Dentist', bucket: 'timed', scheduledFor: new Date(2026, 9, 20) }))).toBeNull()
  })

  it('a slow add keeps words typed meanwhile and ignores a second Enter', async () => {
    let resolve!: (v: string) => void
    h.addTask.mockReturnValueOnce(new Promise<string>((r) => { resolve = r }))
    render(ui())
    plan()
    fireEvent.change(addBox(), { target: { value: 'Book the cabin deposit' } })
    fireEvent.submit(addBox().closest('form')!)
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    fireEvent.submit(addBox().closest('form')!)
    fireEvent.change(addBox(), { target: { value: 'Ask about time off' } })
    await act(async () => { resolve('saved-id') })
    expect(h.addTask).toHaveBeenCalledTimes(1)
    expect(addBox().value).toBe('Ask about time off')
  })
})
