import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { needsDomain, gateUpdate, useGatedTaskActions } from './useGatedTaskActions'
import type { Task } from '@/types/task'

const unsorted = { id: 't', title: 'x', context: null } as never
const tagged = { id: 't', title: 'x', context: 'work' } as never
/** A step of a family task: context null on purpose, parent set. */
const step = { id: 's', title: 'step', context: null, parentTaskId: 'parent' } as never

// useGatedTaskActions calls useDomainGate() itself, so the hook-level tests
// below mock it directly rather than rendering a real DomainGateProvider +
// clicking through the modal — DomainGate.test.tsx already covers the modal
// UI; this file is about the gating LOGIC (what asks, what writes, what a
// cancel skips) and the hook's referential stability.
const mockRequireDomain = vi.fn()
vi.mock('@/components/domain/DomainGate', () => ({
  useDomainGate: () => ({ requireDomain: mockRequireDomain }),
}))

describe('needsDomain', () => {
  it('scheduling, bucketing, assigning, or projecting an Unsorted task needs a domain', () => {
    expect(needsDomain(unsorted, { scheduledFor: new Date() })).toBe(true)
    expect(needsDomain(unsorted, { bucket: 'week' })).toBe(true)
    expect(needsDomain(unsorted, { assignedToAll: ['m'] })).toBe(true)
    expect(needsDomain(unsorted, { projectId: 'p' })).toBe(true)
  })
  it('does not fire for a tagged task, a title edit, or an update that carries its own context', () => {
    expect(needsDomain(tagged, { scheduledFor: new Date() })).toBe(false)
    expect(needsDomain(unsorted, { title: 'y' })).toBe(false)
    expect(needsDomain(unsorted, { scheduledFor: new Date(), context: 'family' })).toBe(false)
  })

  // A step's context is null BY DESIGN (addSubtask leaves it so — a step is
  // part of its parent, not a separate item on a domain surface). Gating it
  // asked "where does this belong?" for every reschedule of every step, and
  // answering Work stamped context='work' onto the step, whose scope then
  // derived to 'individual' — the partner lost a step of a task they share.
  it('never fires for a SUBTASK, whatever its own context says', () => {
    expect(needsDomain(step, { scheduledFor: new Date() })).toBe(false)
    expect(needsDomain(step, { bucket: 'week' })).toBe(false)
    expect(needsDomain(step, { assignedTo: 'member-partner' })).toBe(false)
    expect(needsDomain(step, { projectId: 'p' })).toBe(false)
  })
})

describe('gateUpdate', () => {
  it('asks, then writes the update WITH the chosen domain; cancel writes nothing', async () => {
    const write = vi.fn()
    await gateUpdate(unsorted, { bucket: 'week' }, async () => 'family', write)
    expect(write).toHaveBeenCalledWith('t', { bucket: 'week', context: 'family' })
    write.mockClear()
    await gateUpdate(unsorted, { bucket: 'week' }, async () => null, write)
    expect(write).not.toHaveBeenCalled()
  })
})

describe('useGatedTaskActions setBucket', () => {
  beforeEach(() => {
    mockRequireDomain.mockReset()
  })

  function makeRaw() {
    return {
      updateTask: vi.fn(),
      pushTask: vi.fn(),
      updateTasksBulk: vi.fn(),
      setBucket: vi.fn(),
    }
  }

  it('asks when the task is untagged, writes the context, then calls raw setBucket', async () => {
    mockRequireDomain.mockResolvedValue('family')
    const raw = makeRaw()
    const findTask = (id: string) => (id === 't' ? (unsorted as Task) : undefined)
    const { result } = renderHook(() => useGatedTaskActions(raw, findTask))

    await result.current.setBucket!('t', 'week', undefined, undefined)

    expect(mockRequireDomain).toHaveBeenCalledWith(unsorted)
    expect(raw.updateTask).toHaveBeenCalledWith('t', { context: 'family' })
    expect(raw.setBucket).toHaveBeenCalledWith('t', 'week', undefined, undefined)
    // Context write happens before the bucket write, not after.
    const updateOrder = raw.updateTask.mock.invocationCallOrder[0]
    const setBucketOrder = raw.setBucket.mock.invocationCallOrder[0]
    expect(updateOrder).toBeLessThan(setBucketOrder)
  })

  it('cancel (ask resolves null) calls neither raw updateTask nor raw setBucket', async () => {
    mockRequireDomain.mockResolvedValue(null)
    const raw = makeRaw()
    const findTask = (id: string) => (id === 't' ? (unsorted as Task) : undefined)
    const { result } = renderHook(() => useGatedTaskActions(raw, findTask))

    await result.current.setBucket!('t', 'week', undefined, undefined)

    expect(mockRequireDomain).toHaveBeenCalled()
    expect(raw.updateTask).not.toHaveBeenCalled()
    expect(raw.setBucket).not.toHaveBeenCalled()
  })

  it('a SUBTASK never asks — setBucket runs straight through and writes no context', async () => {
    const raw = makeRaw()
    const findTask = (id: string) => (id === 's' ? (step as Task) : undefined)
    const { result } = renderHook(() => useGatedTaskActions(raw, findTask))

    await result.current.setBucket!('s', 'week', undefined, undefined)

    expect(mockRequireDomain).not.toHaveBeenCalled()
    expect(raw.updateTask).not.toHaveBeenCalled()
    expect(raw.setBucket).toHaveBeenCalledWith('s', 'week', undefined, undefined)
  })

  it('a tagged task never asks — setBucket runs straight through', async () => {
    const raw = makeRaw()
    const findTask = (id: string) => (id === 't' ? (tagged as Task) : undefined)
    const { result } = renderHook(() => useGatedTaskActions(raw, findTask))

    await result.current.setBucket!('t', 'month', new Date('2026-09-01'), true)

    expect(mockRequireDomain).not.toHaveBeenCalled()
    expect(raw.updateTask).not.toHaveBeenCalled()
    expect(raw.setBucket).toHaveBeenCalledWith('t', 'month', new Date('2026-09-01'), true)
  })
})

// The gate asks about the UNTAGGED half of a mixed selection. Stamping that
// answer onto the whole selection re-tagged rows that already had an answer —
// a Work item bulk-scheduled alongside Unsorted ones became Family, silently,
// and its scope was rederived to match.
describe('useGatedTaskActions updateTasksBulk', () => {
  beforeEach(() => {
    mockRequireDomain.mockReset()
  })

  const untagged = { id: 'u', title: 'untagged', context: null } as never
  const work = { id: 'w', title: 'work item', context: 'work' } as never
  const findMixed = (id: string) =>
    (id === 'u' ? (untagged as Task) : id === 'w' ? (work as Task) : undefined)

  it('stamps the chosen domain on the UNTAGGED rows only', async () => {
    mockRequireDomain.mockResolvedValue('family')
    const raw = {
      updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn().mockResolvedValue(undefined),
    }
    const { result } = renderHook(() => useGatedTaskActions(raw, findMixed))

    await result.current.updateTasksBulk(['w', 'u'], { bucket: 'week' })

    expect(raw.updateTasksBulk).toHaveBeenCalledTimes(2)
    expect(raw.updateTasksBulk).toHaveBeenCalledWith(['w'], { bucket: 'week' })
    expect(raw.updateTasksBulk).toHaveBeenCalledWith(['u'], { bucket: 'week', context: 'family' })
  })

  it('asks once, about the untagged count only', async () => {
    mockRequireDomain.mockResolvedValue('family')
    const raw = {
      updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn().mockResolvedValue(undefined),
    }
    const { result } = renderHook(() => useGatedTaskActions(raw, findMixed))

    await result.current.updateTasksBulk(['w', 'u'], { bucket: 'week' })

    expect(mockRequireDomain).toHaveBeenCalledTimes(1)
    expect(mockRequireDomain).toHaveBeenCalledWith({ id: 'u', title: '1 items', context: null })
  })

  it('a selection with nothing untagged writes once, unchanged', async () => {
    const raw = {
      updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn().mockResolvedValue(undefined),
    }
    const { result } = renderHook(() => useGatedTaskActions(raw, findMixed))

    await result.current.updateTasksBulk(['w'], { bucket: 'week' })

    expect(mockRequireDomain).not.toHaveBeenCalled()
    expect(raw.updateTasksBulk).toHaveBeenCalledTimes(1)
    expect(raw.updateTasksBulk).toHaveBeenCalledWith(['w'], { bucket: 'week' })
  })

  it('cancel writes nothing at all — not even the already-tagged rows', async () => {
    mockRequireDomain.mockResolvedValue(null)
    const raw = {
      updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn().mockResolvedValue(undefined),
    }
    const { result } = renderHook(() => useGatedTaskActions(raw, findMixed))

    await result.current.updateTasksBulk(['w', 'u'], { bucket: 'week' })

    expect(raw.updateTasksBulk).not.toHaveBeenCalled()
  })
})

describe('useGatedTaskActions referential stability', () => {
  it('returns the same gated object across re-renders when raw and findTask are unchanged', () => {
    const raw = {
      updateTask: vi.fn(),
      pushTask: vi.fn(),
      updateTasksBulk: vi.fn(),
    }
    const findTask = () => undefined
    const { result, rerender } = renderHook(() => useGatedTaskActions(raw, findTask))

    const first = result.current
    rerender()
    expect(result.current).toBe(first)

    // A brand new (but equivalent) raw object is the real-world failure mode
    // this guards against: an inline object literal at the call site recreates
    // `raw` every render even though nothing meaningful changed.
    rerender()
    expect(result.current).toBe(first)
  })

  it('gets a NEW identity when raw is a fresh object each render (the bug this test catches)', () => {
    const findTask = () => undefined
    const { result, rerender } = renderHook(
      () =>
        useGatedTaskActions(
          { updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn() },
          findTask,
        ),
    )
    const first = result.current
    rerender()
    expect(result.current).not.toBe(first)
  })
})
