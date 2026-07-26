import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { TodayDragProvider, useTodayDragState } from './TodayDragProvider'
import { bandDropId, rowDropId } from '@/lib/today/todayDrop'

function Probe() {
  const { dragging, activeId, hoverExpanded } = useTodayDragState()
  return (
    <div data-testid="probe">
      {dragging ? `dragging:${activeId}` : 'idle'}|{[...hoverExpanded].join(',')}
    </div>
  )
}

type Handlers = {
  onDragStart: (e: DragStartEvent) => void
  onDragOver: (e: DragOverEvent) => void
  onDragEnd: (e: DragEndEvent) => void
}

function setup(over: Partial<Parameters<typeof TodayDragProvider>[0]> = {}) {
  const captured: { h?: Handlers } = {}
  const onIntents = vi.fn()
  const resolve = vi.fn(() => [])
  render(
    <TodayDragProvider
      resolve={resolve}
      onIntents={onIntents}
      renderOverlay={() => null}
      __testHandlers={(h) => { captured.h = h }}
      {...over}
    >
      <Probe />
    </TodayDragProvider>
  )
  return { captured, onIntents, resolve }
}

describe('TodayDragProvider', () => {
  it('starts idle and exposes drag state to descendants', () => {
    setup()
    expect(screen.getByTestId('probe')).toHaveTextContent('idle')
  })

  it('reports the active id while a drag is in flight', () => {
    const { captured } = setup()
    act(() => { captured.h!.onDragStart({ active: { id: 'task-a' } } as DragStartEvent) })
    expect(screen.getByTestId('probe')).toHaveTextContent('dragging:task-a')
  })

  it('applies the resolved intents on drop', () => {
    const resolve = vi.fn(() => [{ kind: 'make-all-day' as const, itemId: 'task-a' }])
    const { captured, onIntents } = setup({ resolve })
    act(() => {
      captured.h!.onDragEnd({
        active: { id: 'task-a' }, over: { id: bandDropId('allday') },
      } as DragEndEvent)
    })
    expect(resolve).toHaveBeenCalledWith('task-a', bandDropId('allday'))
    expect(onIntents).toHaveBeenCalledWith([{ kind: 'make-all-day', itemId: 'task-a' }])
  })

  it('does nothing when dropped outside every target', () => {
    const { captured, onIntents } = setup()
    act(() => {
      captured.h!.onDragEnd({ active: { id: 'task-a' }, over: null } as DragEndEvent)
    })
    expect(onIntents).not.toHaveBeenCalled()
  })

  it('does not call onIntents when the resolver returns nothing', () => {
    const { captured, onIntents } = setup({ resolve: () => [] })
    act(() => {
      captured.h!.onDragEnd({
        active: { id: 'task-a' }, over: { id: bandDropId('unscheduled') },
      } as DragEndEvent)
    })
    expect(onIntents).not.toHaveBeenCalled()
  })

  it('clears the active id after a drop', () => {
    const { captured } = setup()
    act(() => { captured.h!.onDragStart({ active: { id: 'task-a' } } as DragStartEvent) })
    act(() => {
      captured.h!.onDragEnd({ active: { id: 'task-a' }, over: null } as DragEndEvent)
    })
    expect(screen.getByTestId('probe')).toHaveTextContent('idle')
  })

  it('expands a hovered group after the dwell, so members stay reachable mid-drag', () => {
    vi.useFakeTimers()
    try {
      const { captured } = setup()
      act(() => { captured.h!.onDragStart({ active: { id: 'task-a' } } as DragStartEvent) })
      act(() => {
        captured.h!.onDragOver({ over: { id: rowDropId('task-w1') } } as DragOverEvent)
      })
      // Not yet — a passing hover must not open anything.
      expect(screen.getByTestId('probe')).not.toHaveTextContent('w1')
      act(() => { vi.advanceTimersByTime(600) })
      expect(screen.getByTestId('probe')).toHaveTextContent('w1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the dwell when the cursor leaves the row', () => {
    vi.useFakeTimers()
    try {
      const { captured } = setup()
      act(() => { captured.h!.onDragStart({ active: { id: 'task-a' } } as DragStartEvent) })
      act(() => { captured.h!.onDragOver({ over: { id: rowDropId('task-w1') } } as DragOverEvent) })
      act(() => { captured.h!.onDragOver({ over: null } as DragOverEvent) })
      act(() => { vi.advanceTimersByTime(600) })
      expect(screen.getByTestId('probe')).not.toHaveTextContent('w1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets hover-expansions once the drag ends', () => {
    vi.useFakeTimers()
    try {
      const { captured } = setup()
      act(() => { captured.h!.onDragStart({ active: { id: 'task-a' } } as DragStartEvent) })
      act(() => { captured.h!.onDragOver({ over: { id: rowDropId('task-w1') } } as DragOverEvent) })
      act(() => { vi.advanceTimersByTime(600) })
      act(() => { captured.h!.onDragEnd({ active: { id: 'task-a' }, over: null } as DragEndEvent) })
      expect(screen.getByTestId('probe')).not.toHaveTextContent('w1')
    } finally {
      vi.useRealTimers()
    }
  })
})
