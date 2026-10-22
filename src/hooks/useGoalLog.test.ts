import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { listGoalLog } = vi.hoisted(() => ({ listGoalLog: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/choices/logDb', () => ({ listGoalLog }))
const USER = { id: 'u1' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: USER }) }))

import { useGoalLog } from './useGoalLog'
import { CHOICES_UPDATED } from '@/lib/choices/events'

const goal = { kind: 'task', id: 'g1' } as const
const entry = (id: string, on: string) => ({
  id, userId: 'u1', goal, kind: 'call', on, summary: id, createdAt: new Date(2026, 9, 1),
})

describe('useGoalLog', () => {
  beforeEach(() => {
    listGoalLog.mockReset()
    listGoalLog.mockResolvedValue({ entries: [entry('a', '2026-10-20')], planned: [] })
  })

  it('reads the goal log, merged, and again when a change is announced', async () => {
    const { result } = renderHook(() => useGoalLog(goal))
    await waitFor(() => expect(result.current.log.done.map((l) => l.text)).toEqual(['a']))
    expect(listGoalLog).toHaveBeenCalledWith({}, goal)
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.loading).toBe(false)

    listGoalLog.mockResolvedValue({ entries: [entry('a', '2026-10-20'), entry('b', '2026-10-21')], planned: [] })
    await act(async () => { window.dispatchEvent(new Event(CHOICES_UPDATED)) })
    await waitFor(() => expect(result.current.log.done.map((l) => l.text)).toEqual(['b', 'a']))
  })

  it('a failed read keeps the log already shown', async () => {
    const { result } = renderHook(() => useGoalLog(goal))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    listGoalLog.mockResolvedValue(null)
    await act(async () => { window.dispatchEvent(new Event('symphony-plan-updated')) })
    expect(listGoalLog).toHaveBeenCalledTimes(2)
    expect(result.current.entries).toHaveLength(1)
  })

  it('an older read that finishes last does not replace a newer one', async () => {
    const { result } = renderHook(() => useGoalLog(goal))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    let finishOld: (v: unknown) => void = () => {}
    listGoalLog.mockReturnValueOnce(new Promise((r) => { finishOld = r }))
    listGoalLog.mockResolvedValueOnce({ entries: [entry('new', '2026-10-21')], planned: [] })
    await act(async () => {
      window.dispatchEvent(new Event(CHOICES_UPDATED)) // old read, still out
      window.dispatchEvent(new Event(CHOICES_UPDATED)) // newer read
    })
    await waitFor(() => expect(result.current.log.done.map((l) => l.text)).toEqual(['new']))
    await act(async () => { finishOld({ entries: [entry('old', '2026-10-01')], planned: [] }) })
    expect(result.current.log.done.map((l) => l.text)).toEqual(['new'])
  })

  it('no goal: an empty log and no read', async () => {
    const { result } = renderHook(() => useGoalLog(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(listGoalLog).not.toHaveBeenCalled()
    expect(result.current.log).toEqual({ upcoming: [], done: [] })
  })
})
