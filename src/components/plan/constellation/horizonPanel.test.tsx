import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'
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

let deps: HorizonPanelDeps
function Harness({ id }: { id: string }) {
  const h = useHorizonPanel(deps.tasks.find((x) => x.id === id) ?? null, deps)
  return <div><ul aria-label="period actions">{h.actions.map((a) => <li key={a.id}><button type="button" onClick={a.onClick}>{a.label}</button></li>)}</ul></div>
}
const show = (url: string, id = 'm') => render(<MemoryRouter initialEntries={[url]}><Harness id={id} /></MemoryRouter>)
const verbs = () => within(screen.getByRole('list', { name: 'period actions' })).queryAllByRole('button').map((b) => b.textContent)
const last = () => runs.calls[runs.calls.length - 1]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 9, 9))
  runs.calls = []
  deps = {
    tasks: TASKS, seasons: DEFAULT_SEASONS,
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
  it('a month item shows Later: November and Let go, and no ties or move to the level above', () => {
    show('/month?view=constellation&horizon=2&start=2026-10-09')
    expect(verbs()).toEqual(['Later: November', 'Let go'])
    expect(screen.queryByText('For')).toBeNull()
    expect(screen.queryByRole('button', { name: /Move .* under/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to Fall' })).toBeNull()
  })
  it('Later: November carries it on, and Undo puts back the periods it was on', async () => {
    show('/month?view=constellation&horizon=2&start=2026-10-09')
    fireEvent.click(screen.getByRole('button', { name: 'Later: November' }))
    await waitFor(() => expect(deps.keepForward).toHaveBeenCalledWith('m', { monthStart: NOV }, OCT))
    expect(last()).toMatchObject({ label: 'Move “Picnic” to November', ok: true })
    await last().opts.undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('m', { commitments: [{ level: 'month', periodStart: OCT, status: 'open' }] })
  })
  it('a season item: Later: Winter and Let go', () => {
    show('/season?view=constellation&horizon=1&start=2026-10-09', 's1')
    expect(verbs()).toEqual(['Later: Winter', 'Let go'])
  })
  // Review focus 4: one task on a season, a month and a week list.
  it('Let go on November ends only the November commitment of an item on several lists', async () => {
    const SEASON = new Date(2026, 9, 1), WEEK = new Date(2026, 9, 31)
    const multi = t({ id: 'multi', title: 'Plan Thanksgiving', bucket: 'month', monthStart: NOV, commitments: [
      { level: 'season', periodStart: SEASON, status: 'open' }, { level: 'month', periodStart: NOV, status: 'open' }, { level: 'week', periodStart: WEEK, status: 'open' },
    ] as Task['commitments'] })
    deps.tasks = [multi]
    show('/month?view=constellation&horizon=2&start=2026-11-01', 'multi')
    expect(verbs()).toEqual(['Later: December', 'Let go'])
    fireEvent.click(screen.getByRole('button', { name: 'Let go' }))
    await waitFor(() => expect(deps.dropCommitment).toHaveBeenCalledWith('multi', 'month', NOV))
    expect(deps.dropCommitment).toHaveBeenCalledTimes(1)
    expect(deps.updateTask).not.toHaveBeenCalled()
    expect(deps.keepForward).not.toHaveBeenCalled()
    expect(last()).toMatchObject({ label: 'Let go: “Plan Thanksgiving”', ok: true })
    await last().opts.undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('multi', { commitments: multi.commitments })
  })
  it('Let go of the last open commitment sends the item to Someday, with Undo', async () => {
    show('/month?view=constellation&horizon=2&start=2026-10-09')
    fireEvent.click(screen.getByRole('button', { name: 'Let go' }))
    await waitFor(() => expect(deps.updateTask).toHaveBeenCalledWith('m', { bucket: 'someday', scheduledFor: undefined }))
    expect(deps.dropCommitment).not.toHaveBeenCalled()
    expect(last()).toMatchObject({ label: 'Let go: “Picnic”', ok: true })
    await last().opts.undo!()
    expect(deps.updateTask).toHaveBeenLastCalledWith('m', expect.objectContaining({ commitments: [{ level: 'month', periodStart: OCT, status: 'open' }] }))
  })
  it('offers nothing off a horizon page', () => {
    show('/today?detail=task:m')
    expect(verbs()).toEqual([])
  })
  it('a task on another month says nothing here', () => {
    show('/month?view=constellation&horizon=2&start=2026-12-01')
    expect(verbs()).toEqual([])
  })
  it('a done item has no period verbs', () => {
    deps.tasks = TASKS.map((x) => x.id === 'm' ? { ...x, completed: true } : x)
    show('/month?view=constellation&horizon=2&start=2026-10-09')
    expect(verbs()).toEqual([])
  })
})
