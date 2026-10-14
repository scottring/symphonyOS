import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { CanvasActivityProvider, useCanvasActivity, type CanvasActivity, type CanvasActivityProviderProps } from './CanvasActivityContext'
import type { Task } from '@/types/task'

const t0 = new Date('2026-10-10T08:00:00Z')
function task(id: string, title = id): Task {
  return { id, title, completed: false, createdAt: t0, updatedAt: t0 } as Task
}

function Probe({ onReady }: { onReady: (a: CanvasActivity) => void }) {
  const a = useCanvasActivity()
  useEffect(() => { onReady(a) })
  return <div data-testid="state">{a.receipt ? `${a.receipt.state}|${a.receipt.summary}|${a.receipt.undoable ? 'undo' : ''}|${a.receipt.canRetry ? 'retry' : ''}` : 'none'}</div>
}

function Harness({ initial, after, writers, onReady, retryTurn }: {
  initial: Task[]; after: Task[]; writers: Partial<Record<'deleteTask' | 'updateTask' | 'deleteGoal' | 'updateGoal', ReturnType<typeof vi.fn>>>
  onReady: (a: CanvasActivity) => void; retryTurn?: () => void
}) {
  const [tasks, setTasks] = useState(initial)
  const refetch = async () => { setTasks(after) }
  return (
    <CanvasActivityProvider
      snapshot={{ tasks, goals: [] }}
      writers={{ deleteTask: writers.deleteTask ?? vi.fn(), updateTask: writers.updateTask ?? vi.fn(), deleteGoal: writers.deleteGoal ?? vi.fn(), updateGoal: writers.updateGoal ?? vi.fn() }}
      refetch={refetch}
      retryTurn={retryTurn}
    >
      <Probe onReady={onReady} />
    </CanvasActivityProvider>
  )
}

describe('CanvasActivityProvider', () => {
  it('reports a writing turn as saved only after the refetched rows show it, and undoes a creation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const deleteTask = vi.fn().mockResolvedValue(undefined)
    let api!: CanvasActivity
    const created = { ...task('n1', 'Call the plumber'), createdAt: new Date(), updatedAt: new Date() }
    render(<Harness initial={[task('a')]} after={[task('a'), created]} writers={{ deleteTask }} onReady={(a) => { api = a }} />)
    act(() => api.turnStarted('Add the plumber to today', false))
    expect(screen.getByTestId('state').textContent).toMatch(/^working/)
    act(() => api.toolUsed('symphony_create_task'))
    expect(screen.getByTestId('state').textContent).toMatch(/^saving\|Adding a task/)
    act(() => api.turnEnded({ didWrite: true, error: null, text: 'Done.' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('saved|Added “Call the plumber”|undo|'))
    expect(api.isArrived('n1')).toBe(true)
    await act(async () => { await api.undo() })
    expect(deleteTask).toHaveBeenCalledWith('n1')
    vi.useRealTimers()
  })

  it('does not claim a save when the write never shows up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let api!: CanvasActivity
    render(<Harness initial={[task('a')]} after={[task('a')]} writers={{}} onReady={(a) => { api = a }} retryTurn={() => {}} />)
    act(() => api.turnStarted('Add milk', false))
    act(() => api.toolUsed('symphony_create_task'))
    act(() => api.turnEnded({ didWrite: true, error: 'Connection dropped', text: '' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe("failed|Didn't save. Nothing changed.||retry"))
    vi.useRealTimers()
  })

  it('marks a turn partly saved when some writes landed and the stream failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let api!: CanvasActivity
    const created = { ...task('n2', 'Tour the Y'), createdAt: new Date(), updatedAt: new Date() }
    render(<Harness initial={[]} after={[created]} writers={{}} onReady={(a) => { api = a }} retryTurn={() => {}} />)
    act(() => api.turnStarted('Plan the week', false))
    act(() => api.toolUsed('symphony_create_plan_item'))
    act(() => api.toolResult({ name: 'symphony_create_plan_item', ok: false, error: 'timeout' }))
    act(() => api.turnEnded({ didWrite: true, error: null, text: '' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => expect(screen.getByTestId('state').textContent).toMatch(/^partial\|Added “Tour the Y”\. Some of it didn't save\.\|undo\|retry$/))
    vi.useRealTimers()
  })

  it('treats a reply with no writes as an answer, not a save', async () => {
    let api!: CanvasActivity
    render(<Harness initial={[]} after={[]} writers={{}} onReady={(a) => { api = a }} />)
    act(() => api.turnStarted('What is on Thursday?', false))
    act(() => api.turnEnded({ didWrite: false, error: null, text: 'Parent night.' }))
    expect(screen.getByTestId('state').textContent).toBe('answered|||')
  })

  it('runs manual commands with saved/failed states, Undo and Retry', async () => {
    let api!: CanvasActivity
    render(<Harness initial={[]} after={[]} writers={{}} onReady={(a) => { api = a }} />)
    const undo = vi.fn().mockResolvedValue(true)
    await act(async () => { await api.run('Linked “Tour the Y”', async () => true, { ids: ['x'], undo }) })
    expect(screen.getByTestId('state').textContent).toBe('saved|Saved|undo|')
    expect(api.isArrived('x')).toBe(true)
    await act(async () => { await api.undo() })
    expect(undo).toHaveBeenCalled()
    const retry = vi.fn()
    await act(async () => { await api.run('Moved to Thursday', async () => false, { retry }) })
    expect(screen.getByTestId('state').textContent).toBe("failed|Didn't save. Nothing changed.||retry")
    act(() => api.retry())
    expect(retry).toHaveBeenCalled()
  })

  it('keeps proposals until they are resolved and ignores duplicates', () => {
    let api!: CanvasActivity
    render(<Harness initial={[]} after={[]} writers={{}} onReady={(a) => { api = a }} />)
    act(() => api.addProposals([{ key: 'p1', title: 'Sleep by 10:30', level: 1, parentId: 'g1' }]))
    act(() => api.addProposals([{ key: 'p1', title: 'Sleep by 10:30', level: 1, parentId: 'g1' }]))
    expect(api.proposals).toHaveLength(1)
    act(() => api.setProposalState('p1', 'saving'))
    expect(api.proposals[0].state).toBe('saving')
    act(() => api.removeProposal('p1'))
    expect(api.proposals).toHaveLength(0)
  })
})

describe('CanvasActivityProvider — writes the canvas does not hold', () => {
  it('sees a routine created by a turn and offers Undo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let api!: CanvasActivity
    const deleteRoutine = vi.fn().mockResolvedValue(true)
    function RoutineHarness() {
      const [routines, setRoutines] = useState<{ id: string; name: string }[]>([])
      return (
        <CanvasActivityProvider
          snapshot={{ tasks: [], goals: [], routines: routines as never }}
          writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn(), deleteRoutine, updateRoutine: vi.fn() }}
          refetch={async () => { setRoutines([{ id: 'r1', name: 'Canvas test: bedtime' }]) }}
        >
          <Probe onReady={(a) => { api = a }} />
        </CanvasActivityProvider>
      )
    }
    render(<RoutineHarness />)
    act(() => api.turnStarted('Create a bedtime routine', false))
    act(() => api.toolUsed('symphony_create_routine'))
    act(() => api.turnEnded({ didWrite: true, error: null, text: 'Done.' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('saved|Added “Canvas test: bedtime”|undo|'))
    await act(async () => { await api.undo() })
    expect(deleteRoutine).toHaveBeenCalledWith('r1')
    vi.useRealTimers()
  })

  it('does not call an untracked write (a note) a failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let api!: CanvasActivity
    render(<Harness initial={[]} after={[]} writers={{}} onReady={(a) => { api = a }} />)
    act(() => api.turnStarted('Save a note about the picnic', false))
    act(() => api.toolUsed('symphony_create_note'))
    act(() => api.turnEnded({ didWrite: true, error: null, text: 'Saved.' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await waitFor(() => expect(screen.getByTestId('state').textContent).toMatch(/^unverified\|Symphony says it's done/))
    vi.useRealTimers()
  })
})

describe('change sets', () => {
  function mountActivity(extra: { applyChanges?: CanvasActivityProviderProps['applyChanges'] }) {
    let latest: CanvasActivity | null = null
    const Grab = () => { latest = useCanvasActivity(); return null }
    render(
      <CanvasActivityProvider
        snapshot={{ tasks: [], goals: [] }}
        writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }}
        refetch={vi.fn()}
        {...extra}
      ><Grab /></CanvasActivityProvider>,
    )
    return { activity: () => latest! }
  }
  const set = (key: string) => ({ key, title: '2 changes', ops: [
    { key: `${key}:0`, op: 'someday' as const, taskId: 'a', title: 'Paper mail' },
    { key: `${key}:1`, op: 'unplace' as const, taskId: 'b', title: 'Call the bank' },
  ] })

  it('holds one set; a newer one replaces it and says so', () => {
    const { activity } = mountActivity({})
    act(() => activity().setChangeSet(set('s1')))
    act(() => activity().setChangeSet(set('s2')))
    expect(activity().changeSet).toMatchObject({ key: 's2', state: 'proposed', replaced: true })
  })

  it('Approve applies once, clears the card and offers one Undo', async () => {
    const undo = vi.fn(async () => true)
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a', 'b'], undo }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(activity().changeSet).toBeNull()
    expect(activity().receipt).toMatchObject({ state: 'saved', request: '2 changes', undoable: true })
    await act(async () => { await activity().undo() })
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('a stale set stays on the card with the reason, and nothing is undoable', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'stale' as const, title: 'Paper mail' }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().changeSet).toMatchObject({ state: 'failed', message: '“Paper mail” changed since I proposed this. Ask me for a fresh list.' })
    expect(activity().receipt?.undoable).toBe(false)
  })

  it('a failed apply says nothing changed', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'failed' as const }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().changeSet).toMatchObject({ state: 'failed', message: "Couldn't save. Nothing was changed. Try again." })
  })

  it('Undo is gone once the receipt is dismissed', async () => {
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a'], undo: vi.fn(async () => true) }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    act(() => activity().dismiss())
    expect(activity().receipt).toBeNull()
  })
})
