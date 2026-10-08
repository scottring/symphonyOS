// Open journal on the Week page (Scott chose it, 2026-10-08): each October
// priority beside this week's actions for it. Generic fixtures only; mocked
// data — this proves the page's logic, not database permissions.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const h = vi.hoisted(() => ({
  addTask: vi.fn(), updateTask: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), toggleTask: vi.fn(), gatedUpdate: vi.fn(), pushTask: vi.fn(), toast: vi.fn(),
}))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: h.toggleTask, updateTask: h.updateTask, pushTask: h.pushTask, updateTasksBulk: vi.fn(), keepForward: h.keepForward, dropCommitment: h.dropCommitment, addTask: h.addTask, deleteTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: h.gatedUpdate, pushTask: h.pushTask }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('@/hooks/useToast', () => ({ showToast: h.toast }))
// The life area chosen on the add row (the gate a new item must pass).
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: 'family', picker: <span data-testid="area-picker" /> }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: null, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'

const WEEK = new Date(2026, 9, 3)
const OCT = new Date(2026, 9, 1)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 5, 12))
  for (const f of Object.values(h)) f.mockReset()
  h.addTask.mockResolvedValue('new-id'); h.updateTask.mockResolvedValue(true); h.gatedUpdate.mockResolvedValue(true); h.toggleTask.mockResolvedValue(true)
})
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const task = (o: Partial<Task>) => ({ completed: false, createdAt: new Date(2026, 8, 1), assignedTo: 'me', ...o }) as Task
const month = (id: string, title: string, o: Partial<Task> = {}) => task({ id, title, bucket: 'month', monthStart: OCT, commitments: [{ level: 'month', periodStart: OCT, status: 'open' }], ...o })
const weekItem = (id: string, title: string, o: Partial<Task> = {}) => task({ id, title, bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...o })
const TRIP = month('m1', 'Plan the autumn trip')
const SHED = month('m2', 'Clear out the shed')
const BOILER = task({ id: 'm3', title: 'Book the boiler service', bucket: 'week', monthStart: OCT, weekStart: WEEK,
  commitments: [{ level: 'month', periodStart: OCT, status: 'open' }, { level: 'week', periodStart: WEEK, status: 'open' }] })
const PRIVATE = month('mp', 'Another person’s private October line', { assignedTo: 'partner' })
const FIXTURE = [TRIP, SHED, BOILER, PRIVATE,
  weekItem('w1', 'Book the cabin', { sourceId: 'm1' }), weekItem('w2', 'Ask for time off', { sourceId: 'm1' }),
  weekItem('w3', 'Go through the onboarding checklist'), weekItem('w4', 'Draft a note for them', { sourceId: 'mp' }),
  weekItem('w5', 'Call the plumber', { scheduledFor: new Date(2026, 9, 8), isAllDay: true, sourceId: 'm2' })]

let lastDays: Record<string, unknown> = {}
const renderDays = (o: Record<string, unknown>) => { lastDays = o; return <p data-testid="days">days</p> }
const timingControl = (t: Task) => <button type="button">when: {t.title}</button>
const ui = (tasks: Task[], state: unknown = { journal: true }) => <MemoryRouter initialEntries={[{ pathname: '/week', state }]}>
  <WeekV2 tasks={tasks} weekStart={WEEK} meId="me" isCurrent renderDays={renderDays} onSelectTask={vi.fn()} timingControl={timingControl} /></MemoryRouter>
const section = (name: RegExp) => screen.getByRole('region', { name })
const box = (sectionName: RegExp) => within(section(sectionName)).getByRole('textbox') as HTMLInputElement
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

describe('Week · Open journal — mapping and filtering', () => {
  it('each October priority stands beside its week actions; unlinked work is in “Everything else”', () => {
    render(ui(FIXTURE))
    expect(within(section(/^For October: Plan the autumn trip/)).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Book the cabin'), expect.stringContaining('Ask for time off'),
    ])
    expect(within(section(/^For October: Clear out the shed/)).getByText('Call the plumber')).toBeInTheDocument()
    const general = section(/Not tied to an October priority/)
    expect(within(general).getByText('Go through the onboarding checklist')).toBeInTheDocument()
  })

  it('a priority only another person can see makes no section and no title; its action is in Everything else', () => {
    render(ui(FIXTURE))
    expect(screen.queryByText('Another person’s private October line')).toBeNull()
    expect(screen.queryByRole('region', { name: /private October line/ })).toBeNull()
    expect(within(section(/Not tied to an October priority/)).getByText('Draft a note for them')).toBeInTheDocument()
  })

  it('a month line also taken into the week stays visible, as itself, in its own section', () => {
    render(ui(FIXTURE))
    const own = section(/^For October: Book the boiler service/)
    const row = within(own).getByRole('listitem')
    expect(row).toHaveTextContent('Book the boiler service')
    expect(row).toHaveTextContent('This October line itself is on the week')
  })

  it('the days and each action’s “when” control are still there; Lists stays the default view', () => {
    render(ui(FIXTURE))
    expect(screen.getByTestId('days')).toBeInTheDocument()
    expect(typeof lastDays.forControl).toBe('function')
    expect(within(section(/^For October: Clear out the shed/)).getByRole('button', { name: 'when: Call the plumber' })).toBeInTheDocument()
  })

  it('Open journal is the default; choosing Lists is this device’s choice and is kept', () => {
    const { unmount } = render(ui(FIXTURE, null))
    expect(screen.getByRole('region', { name: /This week, by October priority/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    expect(screen.queryByRole('region', { name: /This week, by October priority/ })).toBeNull()
    expect(localStorage.getItem('symphony-plan-layout.week')).toBe('lists')
    expect(Object.keys(localStorage).filter((k) => !k.startsWith('symphony-plan-layout.') && k !== 'symphony-week-ref')).toEqual([])
    unmount()
    render(ui(FIXTURE, null))
    expect(screen.queryByRole('region', { name: /This week, by October priority/ })).toBeNull() // Lists, as chosen
  })
})

describe('Week · Open journal — writing actions', () => {
  it('Enter adds a week action for that priority, in the chosen life area; the box keeps focus for the next', async () => {
    render(ui(FIXTURE))
    const input = box(/^For October: Clear out the shed/)
    for (const t of ['Borrow a trailer', 'Book the tip run']) {
      fireEvent.change(input, { target: { value: t } }); fireEvent.submit(input.closest('form')!)
      await waitFor(() => expect(input.value).toBe(''))
      expect(document.activeElement).toBe(input)
    }
    expect(h.addTask.mock.calls.map((c) => [c[0], c[4].sourceId, c[4].bucket, c[4].context])).toEqual([
      ['Borrow a trailer', 'm2', 'week', 'family'], ['Book the tip run', 'm2', 'week', 'family'],
    ])
  })

  it('the visible Add button adds too, and says which priority it adds to', async () => {
    render(ui(FIXTURE))
    const input = box(/^For October: Plan the autumn trip/)
    fireEvent.change(input, { target: { value: 'Compare two cabins' } })
    fireEvent.click(within(section(/^For October: Plan the autumn trip/)).getByRole('button', { name: 'Add to Plan the autumn trip' }))
    await waitFor(() => expect(h.addTask).toHaveBeenCalledWith('Compare two cabins', undefined, undefined, undefined, expect.objectContaining({ sourceId: 'm1' })))
  })

  it('nothing is promoted: adding an action never moves or changes the October priority', async () => {
    render(ui(FIXTURE))
    const input = box(/^For October: Plan the autumn trip/)
    fireEvent.change(input, { target: { value: 'Book the cabin deposit' } }); fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(h.addTask).toHaveBeenCalledTimes(1))
    expect(h.updateTask).not.toHaveBeenCalled(); expect(h.gatedUpdate).not.toHaveBeenCalled(); expect(h.pushTask).not.toHaveBeenCalled()
  })

  it('a slow save keeps words typed meanwhile, shows Adding, and a second Enter adds nothing twice', async () => {
    const d = deferred<string>()
    h.addTask.mockReturnValueOnce(d.promise)
    render(ui(FIXTURE))
    const input = box(/^For October: Plan the autumn trip/)
    fireEvent.change(input, { target: { value: 'Book the cabin deposit' } }); fireEvent.submit(input.closest('form')!)
    expect(within(section(/^For October: Plan the autumn trip/)).getByRole('button', { name: 'Adding to Plan the autumn trip…' })).toBeInTheDocument()
    fireEvent.submit(input.closest('form')!)
    fireEvent.change(input, { target: { value: 'Pack the car' } })
    expect(input).not.toBeDisabled()
    await act(async () => { d.resolve('id-1'); await d.promise })
    expect(h.addTask).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('Pack the car')
  })

  it('a failed save keeps the words and says so', async () => {
    h.addTask.mockResolvedValueOnce(undefined)
    render(ui(FIXTURE))
    const input = box(/Not tied to an October priority/)
    fireEvent.change(input, { target: { value: 'Return the drill' } }); fireEvent.submit(input.closest('form')!)
    expect(await within(section(/Not tied to an October priority/)).findByRole('alert')).toHaveTextContent('That didn’t save')
    expect(input.value).toBe('Return the drill')
    expect(h.addTask.mock.calls[0][4].sourceId).toBeUndefined()
  })

  it('the priority’s own done is separate from its actions’', async () => {
    render(ui(FIXTURE))
    fireEvent.click(screen.getByRole('button', { name: 'Mark October priority Plan the autumn trip done' }))
    await waitFor(() => expect(h.toggleTask).toHaveBeenCalledWith('m1'))
    expect(h.toggleTask).toHaveBeenCalledTimes(1)
  })

  it('an unlinked action can be linked from Everything else, on the same row', async () => {
    render(ui(FIXTURE))
    fireEvent.click(within(section(/Not tied to an October priority/)).getByRole('button', { name: 'Link Go through the onboarding checklist to an October line' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Clear out the shed' }))
    await waitFor(() => expect(h.updateTask).toHaveBeenCalledWith('w3', { sourceId: 'm2' }))
  })

  it('the footer says how many priorities have nothing this week, and one onward step serves the whole page', () => {
    const { unmount } = render(ui(FIXTURE))
    expect(screen.getByText('Each October priority has something this week.')).toBeInTheDocument()
    unmount()
    render(ui([...FIXTURE, month('m4', 'Sort the winter clothes')]))
    expect(screen.getByText('1 October priority has nothing this week yet — you can leave it for later.')).toBeInTheDocument()
    expect(section(/^For October: Sort the winter clothes/)).toHaveTextContent('No weekly actions for it yet')
    expect(screen.getAllByRole('button', { name: /Choose what to do today/ })).toHaveLength(1)
  })

  // 2026-10-08 review: the same October priority heads this week and next.
  it('another week gives fresh boxes; a save still running lands in its own week and never touches the next', async () => {
    const d = deferred<string>()
    h.addTask.mockReturnValueOnce(d.promise)
    const next = new Date(2026, 9, 10)
    const at = (start: Date) => <MemoryRouter initialEntries={[{ pathname: '/week', state: { journal: true } }]}>
      <WeekV2 tasks={FIXTURE} weekStart={start} meId="me" isCurrent={start === WEEK} renderDays={renderDays} onSelectTask={vi.fn()} timingControl={timingControl} /></MemoryRouter>
    const { rerender } = render(at(WEEK))
    const first = box(/^For October: Plan the autumn trip/)
    fireEvent.change(first, { target: { value: 'Book the cabin deposit' } }); fireEvent.submit(first.closest('form')!)
    rerender(at(next))
    const second = box(/^For October: Plan the autumn trip/)
    expect(second.value).toBe('')
    fireEvent.change(second, { target: { value: 'Pack the car' } })
    await act(async () => { d.resolve('id-1'); await d.promise })
    expect(second.value).toBe('Pack the car')
    expect(h.addTask.mock.calls[0][4]).toMatchObject({ weekStart: WEEK, sourceId: 'm1' })
    fireEvent.submit(second.closest('form')!)
    await waitFor(() => expect(h.addTask).toHaveBeenCalledTimes(2))
    expect(h.addTask.mock.calls[1][4]).toMatchObject({ weekStart: next, sourceId: 'm1' })
  })
})
