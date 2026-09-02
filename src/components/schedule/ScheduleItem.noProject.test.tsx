import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Desktop branch — the project pill used to be a `hidden md:inline-flex` chip
// beside the title.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

const baseItem: TimelineItem = {
  id: 'task-1',
  type: 'task',
  title: 'Call plumber',
  startTime: null,
  endTime: null,
  completed: false,
  projectId: 'proj-1',
  originalTask: { id: '1', title: 'Call plumber' },
} as unknown as TimelineItem

// Projects are HIDDEN from the product (2026-09-02) — the noun read as GTD
// jargon. `projectName`/`projectId` stay on the props (and on the row's data)
// so nothing upstream breaks; the row simply must not draw them any more.
describe('ScheduleItem — Projects hidden', () => {
  it('renders no project pill even when the row is handed a project name', () => {
    const value = {
      onToggleTask: vi.fn(),
      projects: [], contacts: [], familyMembers: [], lists: [],
      projectsMap: new Map(),
      onOpenProject: vi.fn(),
    } as unknown as ScheduleActionsValue
    render(
      <ScheduleActionsProvider value={value}>
        <ScheduleItem
          item={baseItem}
          projectName="Kitchen renovation"
          projectId="proj-1"
          onSelect={vi.fn()}
          onToggleComplete={vi.fn()}
        />
      </ScheduleActionsProvider>
    )
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
    expect(screen.queryByText('Kitchen renovation')).not.toBeInTheDocument()
  })
})
