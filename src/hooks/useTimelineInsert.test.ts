import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineInsert } from './useTimelineInsert'

const ctx = { before: new Date(2026,4,18,18,0), after: new Date(2026,4,18,18,30), section: 'evening' as const, date: new Date(2026,4,18) }

describe('useTimelineInsert', () => {
  it('task pick calls onCreateTaskAt with the snapped anchor', () => {
    const onCreateTaskAt = vi.fn()
    const { result } = renderHook(() => useTimelineInsert({ onCreateTaskAt, onCreateEventAt: vi.fn(), onCreateRoutineAt: vi.fn() }))
    act(() => result.current.handlePick(ctx, 'task'))
    const when = onCreateTaskAt.mock.calls[0][0] as Date
    expect(when.getHours()).toBe(18); expect(when.getMinutes()).toBe(15)
  })
  it('event pick calls onCreateEventAt with the anchor', () => {
    const onCreateEventAt = vi.fn()
    const { result } = renderHook(() => useTimelineInsert({ onCreateTaskAt: vi.fn(), onCreateEventAt, onCreateRoutineAt: vi.fn() }))
    act(() => result.current.handlePick(ctx, 'event'))
    expect((onCreateEventAt.mock.calls[0][0] as Date).getMinutes()).toBe(15)
  })
  it('note pick opens the composer with the anchor instead of calling a create fn', () => {
    const { result } = renderHook(() => useTimelineInsert({ onCreateTaskAt: vi.fn(), onCreateEventAt: vi.fn(), onCreateRoutineAt: vi.fn() }))
    act(() => result.current.handlePick(ctx, 'note'))
    expect(result.current.noteComposer?.anchor?.getMinutes()).toBe(15)
  })
})
