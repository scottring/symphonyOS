import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { CanvasActivityProvider, readPendingCard, writePendingCard, useCanvasActivity, type CanvasActivity, type CanvasActivityProviderProps } from './CanvasActivityContext'
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
  it('reports refetched changes without an unsafe snapshot-based Undo', async () => {
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
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('saved|Added “Call the plumber”||'))
    expect(api.isArrived('n1')).toBe(true)
    await act(async () => { await api.undo() })
    expect(deleteTask).not.toHaveBeenCalled()
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
    await waitFor(() => expect(screen.getByTestId('state').textContent).toMatch(/^partial\|Added “Tour the Y”\. Some of it didn't save\.\|\|retry$/))
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
  it('sees a routine created by a turn without attributing the snapshot difference to Undo', async () => {
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
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('saved|Added “Canvas test: bedtime”||'))
    await act(async () => { await api.undo() })
    expect(deleteRoutine).not.toHaveBeenCalled()
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
    render(
      <CanvasActivityProvider
        snapshot={{ tasks: [], goals: [] }}
        writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }}
        refetch={vi.fn()}
        {...extra}
      ><Probe onReady={(a) => { latest = a }} /></CanvasActivityProvider>,
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

  it('a failed apply that was fully reversed says nothing changed', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'failed' as const, reverted: true, kept: [] }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().changeSet).toMatchObject({ state: 'failed', message: "Couldn't save. Nothing was changed. Try again." })
  })

  it('a failed apply that left a write in place says so', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'failed' as const, reverted: false, kept: ['a'] }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().changeSet).toMatchObject({ state: 'partial', message: expect.stringMatching(/some of it stayed saved/) })
    await act(async () => { await activity().approveChangeSet() })
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(activity().receipt).toMatchObject({ state: 'partial', summary: expect.stringMatching(/some of it stayed saved/) })
  })

  it('Undo is gone once the receipt is dismissed', async () => {
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a'], undo: vi.fn(async () => true) }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    act(() => activity().dismiss())
    expect(activity().receipt).toBeNull()
  })

  function gate() {
    let resolve!: (v: Awaited<ReturnType<NonNullable<CanvasActivityProviderProps['applyChanges']>>>) => void
    const promise = new Promise<Awaited<ReturnType<NonNullable<CanvasActivityProviderProps['applyChanges']>>>>((r) => { resolve = r })
    return { promise, resolve }
  }

  it('a newer set that arrives while one saves survives the older apply succeeding', async () => {
    const g = gate()
    const { activity } = mountActivity({ applyChanges: () => g.promise })
    act(() => activity().setChangeSet(set('s1')))
    let p!: Promise<boolean>
    act(() => { p = activity().approveChangeSet() })
    act(() => activity().setChangeSet(set('s2')))
    await act(async () => { g.resolve({ ok: true, ids: ['a'], undo: async () => true }); await p })
    expect(activity().changeSet).toMatchObject({ key: 's2', state: 'proposed', replaced: true })
  })

  it('a newer set survives the older apply failing', async () => {
    const g = gate()
    const { activity } = mountActivity({ applyChanges: () => g.promise })
    act(() => activity().setChangeSet(set('s1')))
    let p!: Promise<boolean>
    act(() => { p = activity().approveChangeSet() })
    act(() => activity().setChangeSet(set('s2')))
    await act(async () => { g.resolve({ ok: false, reason: 'failed' }); await p })
    expect(activity().changeSet).toMatchObject({ key: 's2', state: 'proposed' })
    expect(activity().changeSet?.message).toBeUndefined()
  })

  it('two Approves in the same tick apply once, and the same set re-announced keeps saving', async () => {
    const g = gate()
    const applyChanges = vi.fn(() => g.promise)
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    let p1!: Promise<boolean>, p2!: Promise<boolean>
    act(() => { p1 = activity().approveChangeSet(); p2 = activity().approveChangeSet() })
    act(() => activity().setChangeSet(set('s1')))
    expect(activity().changeSet?.state).toBe('saving')
    await act(async () => { await activity().approveChangeSet(); g.resolve({ ok: true, ids: ['a'], undo: async () => true }); await Promise.all([p1, p2]) })
    expect(applyChanges).toHaveBeenCalledTimes(1)
    expect(activity().changeSet).toBeNull()
  })

  it('tells the next turn the last card was approved, once', async () => {
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a', 'b'], undo: async () => true }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    expect(activity().takeChangeCard()).toMatchObject({ state: 'pending', title: '2 changes' })
    // Pending stays pending for every turn until it is decided.
    expect(activity().takeChangeCard()).toMatchObject({ state: 'pending' })
    await act(async () => { await activity().approveChangeSet() })
    const note = activity().takeChangeCard()
    expect(note).toMatchObject({ state: 'approved', title: '2 changes', ops: [
      { op: 'someday', title: 'Paper mail', where: '→ Someday' },
      { op: 'unplace', title: 'Call the bank', where: '→ No day yet' },
    ] })
    expect(typeof note?.at).toBe('string')
    expect(activity().takeChangeCard()).toBeUndefined()
  })

  it('tells the next turn the last card was dismissed; a new proposal replaces the note', () => {
    const { activity } = mountActivity({})
    act(() => activity().setChangeSet(set('s1')))
    act(() => activity().dismissChangeSet())
    expect(activity().takeChangeCard()).toMatchObject({ state: 'dismissed', title: '2 changes' })
    expect(activity().takeChangeCard()).toBeUndefined()
    act(() => activity().setChangeSet(set('s2')))
    act(() => activity().dismissChangeSet())
    act(() => activity().setChangeSet(set('s3')))
    expect(activity().takeChangeCard()).toMatchObject({ state: 'pending' })
  })

  it('a failed Approve leaves the card pending', async () => {
    const applyChanges = vi.fn(async () => ({ ok: false as const, reason: 'failed' as const }))
    const { activity } = mountActivity({ applyChanges })
    act(() => activity().setChangeSet(set('s1')))
    await act(async () => { await activity().approveChangeSet() })
    expect(activity().takeChangeCard()).toMatchObject({ state: 'pending' })
  })

  it('holds what Symphony points at, clears on an empty point and on the next turn', () => {
    const { activity } = mountActivity({})
    act(() => activity().setPointing({ dates: ['2026-10-18'], taskIds: ['a'] }))
    expect(activity().pointing?.dates.has('2026-10-18')).toBe(true)
    expect(activity().pointing?.taskIds.has('a')).toBe(true)
    act(() => activity().setPointing({ dates: [], taskIds: [] }))
    expect(activity().pointing).toBeNull()
    act(() => activity().setPointing({ dates: ['2026-10-19'], taskIds: [] }))
    act(() => activity().turnStarted('Thursday', false))
    expect(activity().pointing).toBeNull()
  })
})

describe('a waiting card survives a reload (plan §4)', () => {
  function mountFor(persistKey: string, applyChanges?: CanvasActivityProviderProps['applyChanges']) {
    let latest: CanvasActivity | null = null
    render(
      <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={vi.fn()} applyChanges={applyChanges} persistKey={persistKey}>
        <Probe onReady={(a) => { latest = a }} />
      </CanvasActivityProvider>,
    )
    return { activity: () => latest! }
  }
  const card = (key: string) => ({ key, title: '1 change', ops: [{ key: `${key}:0`, op: 'place' as const, taskId: 'a', title: 'Paper mail', date: '2026-10-15' }] })

  it('is kept per person in session storage while proposed, and cleared once approved or dismissed', async () => {
    sessionStorage.clear()
    const applyChanges = vi.fn(async () => ({ ok: true as const, ids: ['a'], undo: vi.fn(async () => true) }))
    const first = mountFor('user-1', applyChanges)
    act(() => first.activity().setChangeSet(card('s1')))
    expect(readPendingCard('user-1')?.key).toBe('s1')
    expect(readPendingCard('user-2')).toBeNull()
    // A fresh mount for the same person starts with the card still waiting.
    const again = mountFor('user-1', applyChanges)
    expect(again.activity().changeSet).toMatchObject({ key: 's1', state: 'proposed' })
    act(() => again.activity().dismissChangeSet())
    expect(readPendingCard('user-1')).toBeNull()
    act(() => first.activity().setChangeSet(card('s2')))
    expect(readPendingCard('user-1')?.key).toBe('s2')
    await act(async () => { await first.activity().approveChangeSet() })
    expect(readPendingCard('user-1')).toBeNull()
  })
  it('restores the card when the person becomes known after first render, without wiping it', async () => {
    sessionStorage.clear()
    writePendingCard('user-late', { ...card('s-late'), state: 'proposed' })
    let latest: CanvasActivity | null = null
    const { rerender } = render(
      <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={vi.fn()} persistKey={undefined}>
        <Probe onReady={(a) => { latest = a }} />
      </CanvasActivityProvider>,
    )
    expect(latest!.changeSet).toBeNull()
    expect(readPendingCard('user-late')?.key).toBe('s-late')
    rerender(
      <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={vi.fn()} persistKey="user-late">
        <Probe onReady={(a) => { latest = a }} />
      </CanvasActivityProvider>,
    )
    await waitFor(() => expect(latest!.changeSet).toMatchObject({ key: 's-late', state: 'proposed' }))
    expect(readPendingCard('user-late')?.key).toBe('s-late')
  })

  it('ignores a malformed stored card', () => {
    sessionStorage.setItem('symphony.pendingCard.user-3', '{"key":"x"}')
    expect(readPendingCard('user-3')).toBeNull()
  })
})


it('keeps the last saved Undo after a conversational question, but invalidates it on a new write',async()=>{
 let api!:CanvasActivity
 const undo=vi.fn(async()=>true)
 render(<Harness initial={[]} after={[]} writers={{}} onReady={a=>{api=a}} />)
 await act(async()=>{await api.run('Saved a task',async()=>true,{undo})})
 act(()=>{api.turnStarted('What did you save?',false);api.turnEnded({didWrite:false,error:null,text:'The task.'})})
 expect(api.receipt?.undoable).toBe(true)
 await act(async()=>{expect(await api.undo()).toBe('undone')})
 expect(undo).toHaveBeenCalledTimes(1)
 await act(async()=>{await api.run('Saved another task',async()=>true,{undo})})
 act(()=>{api.turnStarted('Make a different change',false);api.toolUsed('symphony_create_task')})
 await act(async()=>{expect(await api.undo()).toBe('none')})
 expect(undo).toHaveBeenCalledTimes(1)
})
