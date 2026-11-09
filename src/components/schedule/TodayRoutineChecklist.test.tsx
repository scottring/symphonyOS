import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { TodayRoutineChecklist } from './TodayRoutineChecklist'

const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m)
const item = (id: string, title: string, h: number, m = 0, over: Partial<TimelineItem> = {}) => ({
  id: `routine-${id}`, type: 'routine', title, startTime: at(h, m), endTime: null, completed: false,
  originalRoutine: { id }, ...over,
}) as TimelineItem

function setup(items: TimelineItem[], over: Record<string, unknown> = {}) {
  const props = { items, heading: 'Routines today', peopleOf: () => [] as FamilyMember[], onSelect: vi.fn(), onToggleDone: vi.fn(), onPin: vi.fn(), ...over }
  render(<TodayRoutineChecklist {...props} />)
  return props
}

describe('TodayRoutineChecklist', () => {
  it('lists routines in time order, each with its time', () => {
    setup([item('bed', 'Bedtime', 19, 30), item('school', 'School morning', 6, 45)])
    const rows = within(screen.getByRole('list', { name: 'Routines today' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('6:45 AM')
    expect(rows[0]).toHaveTextContent('School morning')
    expect(rows[1]).toHaveTextContent('7:30 PM')
  })

  it('draws nothing, not even the heading, with no routines', () => {
    setup([])
    expect(screen.queryByText('Routines today')).toBeNull()
  })

  it('checks a routine off', () => {
    const props = setup([item('school', 'School morning', 6, 45)])
    fireEvent.click(screen.getByRole('button', { name: 'Mark School morning complete' }))
    expect(props.onToggleDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'routine-school' }))
  })

  it('opens a routine from its name', () => {
    const props = setup([item('school', 'School morning', 6, 45)])
    fireEvent.click(screen.getByRole('button', { name: 'School morning, 6:45 AM' }))
    expect(props.onSelect).toHaveBeenCalledWith('routine-school')
  })

  it('pins a routine to the grid', () => {
    const props = setup([item('school', 'School morning', 6, 45)])
    fireEvent.click(screen.getByRole('button', { name: 'Keep School morning on the grid' }))
    expect(props.onPin).toHaveBeenCalledWith(expect.objectContaining({ id: 'routine-school' }))
  })
})
