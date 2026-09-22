import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// The phone row had lost every non-swipe way in: VoiceOver and keyboard users
// (who cannot swipe) could not open a task's details at all.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))

const item = {
  id: 'task-1', type: 'task', title: 'Call plumber', startTime: null, endTime: null,
  completed: false, originalTask: { id: '1', title: 'Call plumber' },
} as unknown as TimelineItem

function renderRow() {
  const onSelect = vi.fn()
  const onToggleComplete = vi.fn()
  const value = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItem item={item} onSelect={onSelect} onToggleComplete={onToggleComplete} />
    </ScheduleActionsProvider>,
  )
  return { onSelect }
}

describe('ScheduleItem — phone row opens without a swipe', () => {
  it('a tap on the row opens the detail', () => {
    const { onSelect } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Call plumber' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('the title is a real button, so Enter/Space open it from the keyboard', () => {
    renderRow()
    const title = screen.getByRole('button', { name: 'Call plumber' })
    expect(title.tagName).toBe('BUTTON')
    expect(title.closest('[aria-pressed]:not(button)')).toBeNull()
  })

  it('completing does not also open the detail', () => {
    const { onSelect } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
