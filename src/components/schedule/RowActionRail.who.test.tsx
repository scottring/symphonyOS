import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { RowActionRail } from './RowActionRail'
import type { TimelineItem } from '@/types/timeline'

const members = [{ id: 'sk', name: 'Scott', initials: 'SK', color: 'blue' }, { id: 'ir', name: 'Iris', initials: 'IR', color: 'purple' }] as never
const item = { id: 'task-1', type: 'task', title: 'Food prep', startTime: null, endTime: null, completed: false } as unknown as TimelineItem
const renderRail = (assignedToAll: string[]) => render(
  <ScheduleActionsProvider value={{ projects: [], contacts: [], familyMembers: members, lists: [], projectsMap: new Map() } as unknown as ScheduleActionsValue}>
    <RowActionRail item={item} onAssignAll={vi.fn()} familyMembers={members}
      assignedToAll={assignedToAll} assigned={assignedToAll.length > 0} />
  </ScheduleActionsProvider>,
)
const whoSlot = (c: HTMLElement) => c.querySelectorAll('[data-rail-slot]')[0] as HTMLElement

// Scott, 2026-10-04: "why are some people assignment avatars only appearing
// on hover even though they've been assigned?" — your own work hid its face.
describe('RowActionRail — who carries it, always shown', () => {
  it('an item assigned only to you shows your avatar at rest', () => {
    const { container } = renderRail(['sk'])
    expect(whoSlot(container).className).not.toMatch(/md:opacity-0/)
  })

  it('an unassigned item keeps its "assign" control out of the way until hover', () => {
    const { container } = renderRail([])
    expect(whoSlot(container).className).toMatch(/md:opacity-0/)
  })
})

// Scott, 2026-11-13: on Today, initials only for other people. The rail marks
// "only you" and today-journal.css keeps it under hover there; every other
// page still shows your avatar at rest (above).
describe('RowActionRail — marks an item that is only yours', () => {
  const renderAs = (meId: string | null, assignedToAll: string[]) => render(
    <ScheduleActionsProvider value={{ projects: [], contacts: [], familyMembers: members, lists: [], projectsMap: new Map(), meId } as unknown as ScheduleActionsValue}>
      <RowActionRail item={item} onAssignAll={vi.fn()} familyMembers={members} assignedToAll={assignedToAll} assigned={assignedToAll.length > 0} />
    </ScheduleActionsProvider>,
  )
  it('only you: marked', () => {
    expect(whoSlot(renderAs('sk', ['sk']).container)).toHaveAttribute('data-only-self', 'true')
  })
  it('you and someone else, or someone else alone: not marked', () => {
    expect(whoSlot(renderAs('sk', ['sk', 'ir']).container)).not.toHaveAttribute('data-only-self')
    expect(whoSlot(renderAs('sk', ['ir']).container)).not.toHaveAttribute('data-only-self')
  })
})
