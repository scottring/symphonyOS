import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Desktop: the For today card look (design B, 2026-10-07).
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
vi.mock('@/hooks/useTravelTime', () => ({ useTravelTime: () => null }))
vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => ({ onToggleTask: () => {}, viewedDate: new Date(2026, 9, 7) }),
  ScheduleActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const task = (o: Partial<TimelineItem> & { scope?: string } = {}): TimelineItem => {
  const { scope, ...rest } = o
  return {
    id: 'task-1', type: 'task', title: 'Call Sleep Study', startTime: null, endTime: null, allDay: true,
    completed: false, context: 'family', category: 'task', subtaskCount: 0, subtaskCompletedCount: 0,
    originalTask: { id: '1', title: 'Call Sleep Study', scope: scope ?? 'individual' },
    ...rest,
  } as unknown as TimelineItem
}

function renderCard(item: TimelineItem) {
  const onToggleComplete = vi.fn(); const onSelect = vi.fn()
  const utils = render(<ScheduleItem item={item} look="card" onSelect={onSelect} onToggleComplete={onToggleComplete} />)
  return { ...utils, onToggleComplete, onSelect }
}

describe('ScheduleItem look="card" (For today)', () => {
  it('is a card whose icon tile finishes the task without opening it', () => {
    const { container, onToggleComplete, onSelect } = renderCard(task())
    expect(container.querySelector('[data-look="card"]')).toHaveClass('sym-card')
    fireEvent.click(screen.getByRole('button', { name: 'Done: Call Sleep Study' }))
    expect(onToggleComplete).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('previews the note only when it says something', () => {
    renderCard(task({ notes: '## Flow Summary\nCalled to schedule a sleep study; offered the 29th, 30th or 31st.' }))
    expect(screen.getByText('Called to schedule a sleep study; offered the 29th, 30th or 31st.')).toHaveClass('sym-card-note')
  })

  it('says nothing for a bare link or a few characters', () => {
    const { container } = renderCard(task({ notes: 'https://www.fultonbank.com/branches' }))
    expect(container.querySelector('.sym-card-note')).toBeNull()
  })

  it('says "Shared" when the household can see it — the iOS app’s rule', () => {
    renderCard(task({ scope: 'compound' }))
    expect(screen.getByText('Shared')).toHaveClass('sym-tag')
  })

  it('says nothing of sharing for a private task', () => {
    renderCard(task({ scope: 'individual' }))
    expect(screen.queryByText('Shared')).toBeNull()
  })
})
