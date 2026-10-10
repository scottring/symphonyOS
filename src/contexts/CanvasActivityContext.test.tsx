import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { CanvasActivityProvider, useCanvasActivity, type CanvasActivity } from './CanvasActivityContext'
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
