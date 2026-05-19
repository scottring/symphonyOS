// src/components/schedule/ScheduleItem.layer1.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

const today = new Date()
today.setHours(9, 0, 0, 0)

// Minimal valid ScheduleActionsValue — only required fields populated
const minimalActions = {
  onToggleTask: vi.fn(),
  projects: [],
  contacts: [],
  familyMembers: [],
  lists: [],
}

function baseItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'task-1',
    type: 'task',
    title: 'Hang up hooks',
    startTime: today,
    endTime: null,
    completed: false,
    ...overrides,
  } as TimelineItem
}

function renderItem(item: TimelineItem, props: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={minimalActions}>
      <ScheduleItem item={item} onSelect={() => {}} onToggleComplete={() => {}} {...props} />
    </ScheduleActionsProvider>
  )
}

describe('ScheduleItem Layer 1 chrome', () => {
  it('shows a "Today" pill when the item is scheduled for today', () => {
    renderItem(baseItem())
    expect(screen.getByText('Today')).toBeInTheDocument()
  })
  it('does NOT show "Today" pill for a future-dated item', () => {
    const future = new Date(today); future.setDate(future.getDate() + 3)
    renderItem(baseItem({ startTime: future }))
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })
  it('shows a note indicator when notes are present', () => {
    renderItem(baseItem({ notes: 'Use the 3M strips' }))
    expect(screen.getByLabelText('Has notes')).toBeInTheDocument()
  })
  it('hides the note indicator when notes are empty', () => {
    renderItem(baseItem({ notes: '' }))
    expect(screen.queryByLabelText('Has notes')).not.toBeInTheDocument()
  })
  it('renders assignee initials badge from family member name', () => {
    renderItem(baseItem({ assignedTo: 'fm-1' }), {
      familyMembers: [{ id: 'fm-1', name: 'Scott Kaufman' }],
      onAssign: vi.fn(),
    })
    expect(screen.getByText('SK')).toBeInTheDocument()
  })
})
