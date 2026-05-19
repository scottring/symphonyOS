import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineInsert } from './useTimelineInsert'

const ctx = { before: new Date(2026,4,19,18,0), after: new Date(2026,4,19,18,30), section: 'evening' as const, date: new Date(2026,4,19) }

describe('useTimelineInsert', () => {
  it('note pick opens the composer with the anchor', () => {
    const { result } = renderHook(() => useTimelineInsert())
    act(() => result.current.handlePick(ctx, 'note'))
    expect(result.current.noteComposer?.anchor?.getMinutes()).toBe(15)
  })
  it('task/event/routine pick is a no-op here (handled inline by the insert point)', () => {
    const { result } = renderHook(() => useTimelineInsert())
    act(() => result.current.handlePick(ctx, 'task'))
    expect(result.current.noteComposer).toBeNull()
  })
  it('closeNoteComposer clears the composer', () => {
    const { result } = renderHook(() => useTimelineInsert())
    act(() => result.current.handlePick(ctx, 'note'))
    act(() => result.current.closeNoteComposer())
    expect(result.current.noteComposer).toBeNull()
  })
})
