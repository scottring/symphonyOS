import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import { horizonOnScreen, useHorizonPanel, type HorizonPanelDeps } from './horizonPanel'

const runs = vi.hoisted(() => ({ calls: [] as { label: string; ok: boolean; opts: { undo?: () => Promise<unknown> } }[] }))
vi.mock('@/contexts/CanvasActivityContext', () => ({
  useCanvasActivity: () => ({
    run: async (label: string, cmd: () => Promise<unknown>, opts: never) => { const ok = (await cmd()) !== false; runs.calls.push({ label, ok, opts }); return ok },
  }),
}))

// The opened task's panel over a Month or Season page: what the row's ⋯ menu
// did that the panel had no words for (spec 2026-10-14, "The pages").

const SEP = new Date(2026, 8, 1), OCT = new Date(2026, 9, 1), NOV = new Date(2026, 10, 1)
const t = (over: Partial<Task>): Task => ({ id: 'x', title: 'x', completed: false, createdAt: OCT, ...over }) as Task
const TASKS: Task[] = [
  t({ id: 's1', title: 'Autumn outings', bucket: 'quarter', seasonStart: SEP, goalId: 'g' }),
  t({ id: 's2', title: 'Strength', bucket: 'quarter', seasonStart: SEP }),
  t({ id: 'm', title: 'Picnic', bucket: 'month', monthStart: OCT, sourceId: 's1', goalId: 'g' }),
]
const GOALS = [{ id: 'g', name: 'Together', year: 2026, status: 'active' }] as Goal[]

let deps: HorizonPanelDeps
function Harness({ id }: { id: string }) {
  const h = useHorizonPanel(deps.tasks.find((x) => x.id === id) ?? null, deps)
  return <div>{h.forLine}<ul aria-label="period actions">{h.actions.map((a) => <li key={a.id}><button type="button" onClick={a.onClick}>{a.label}</button></li>)}</ul></div>
}
const show = (url: string, id = 'm') => render(<MemoryRouter initialEntries={[url]}><Harness id={id} /></MemoryRouter>)
const verbs = () => within(screen.getByRole('list', { name: 'period actions' })).queryAllByRole('button').map((b) => b.textContent)
const last = () => runs.calls[runs.calls.length - 1]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 9, 9))
  runs.calls = []
  deps = {
    tasks: TASKS, goals: GOALS, seasons: DEFAULT_SEASONS,
    updateTask: vi.fn().mockResolvedValue(true), keepForward: vi.fn().mockResolvedValue('m'), dropCommitment: vi.fn().mockResolvedValue(true),
  }
})
afterEach(() => { vi.useRealTimers() })

describe('horizonOnScreen', () => {
  const at = (path: string, q = '') => horizonOnScreen(path, new URLSearchParams(q), new Date(2026, 9, 14))
  it('reads the page and its period from the URL, as the page does', () => {
    expect(at('/month', 'start=2026-11-03')).toEqual({ level: 2, anchor: new Date(2026, 10, 3) })
    expect(at('/year', 'horizon=1')).toEqual({ level: 1, anchor: new Date(2026, 9, 14) })
    expect(at('/season', 'start=junk')?.level).toBe(1)
    expect(at('/today')).toBeNull()
    expect(at('/week')).toBeNull()
  })
})

describe('the task panel over a horizon page', () => {
  it('says which season goal a month goal serves, and moves it under another with Undo', async () => {
    show('/month?view=constellation&horizon=2&start=2026-10-09&detail=task:m')
    expect(screen.getByText('For')).toBeInTheDocument()
    expect(screen.getByText('Autumn outings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move Picnic under…' }))
    const menu = screen.getByRole('menu', { name: 'Move Picnic under a season goal' })
    expect(within(menu).getByRole('menuitemradio', { name: 'Autumn outings' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Strength' }))
    await waitFor(() => expect(deps.updateTask).toHaveBeenCalledWith('m', { sourceId: 's2', goalId: undefined }))
    expect(last().label).toBe('Move “Picnic” under “Strength”')
    await last().opts.undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('m', { sourceId: 's1', goalId: 'g' })
  })
  // The page's and planning's words (reviewed design, 2026-10-20).
  it('Later: November carries it on; Back to Fall puts it on Fall, then off October; both undo to the periods it was on', async () => {
    show('/month?view=constellation&horizon=2&start=2026-10-09')
    expect(verbs()).toEqual(['Later: November', 'Back to Fall'])
    fireEvent.click(screen.getByRole('button', { name: 'Later: November' }))
    await waitFor(() => expect(deps.keepForward).toHaveBeenCalledWith('m', { monthStart: NOV }, OCT))
    expect(last()).toMatchObject({ label: 'Move “Picnic” to November', ok: true })
    await last().opts.undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('m', { commitments: [{ level: 'month', periodStart: OCT, status: 'open' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Back to Fall' }))
    await waitFor(() => expect(deps.dropCommitment).toHaveBeenCalledWith('m', 'month', OCT))
    expect(deps.keepForward).toHaveBeenLastCalledWith('m', { seasonStart: expect.any(Date) })
    expect(last().label).toBe('Back to Fall: “Picnic”')
  })
  it('a season goal: For a year goal, Later: Winter, and Back to 2026', () => {
    show('/season?view=constellation&horizon=1&start=2026-10-09', 's1')
    expect(screen.getByText('Together')).toBeInTheDocument()
    expect(verbs()).toEqual(['Later: Winter', 'Back to 2026'])
  })
  it('offers nothing off a horizon page, for a task not on its list, or once done', () => {
    show('/today?detail=task:m')
    expect(screen.queryByText('For')).toBeNull()
    expect(verbs()).toEqual([])
  })
  it('a task on another month says nothing here', () => {
    show('/month?view=constellation&horizon=2&start=2026-12-01')
    expect(screen.queryByText('For')).toBeNull()
    expect(verbs()).toEqual([])
  })
  it('a done goal keeps its For line but has no period verbs', () => {
    deps.tasks = TASKS.map((x) => x.id === 'm' ? { ...x, completed: true } : x)
    show('/month?view=constellation&horizon=2&start=2026-10-09')
    expect(screen.getByText('Autumn outings')).toBeInTheDocument()
    expect(verbs()).toEqual([])
  })
})
