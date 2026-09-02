import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItemItems } from './ScheduleItemItems'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'

const members = [
  { id: 'm-liam', name: 'Liam', initials: 'L', color: 'blue' },
  { id: 'm-mia', name: 'Mia', initials: 'M', color: 'purple' },
] as unknown as FamilyMember[]

function task(over: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Wear a collared shirt',
    completed: false,
    ...over,
  } as unknown as Task
}

// The block's day. Hints are read against THIS date, not the wall clock — a
// needed-on date expires by ceasing to match the viewed day.
const viewedDate = new Date('2026-09-10T09:00:00')

describe('ScheduleItemItems', () => {
  it('renders one row per item with the member initials', () => {
    const { getByText, getAllByRole } = render(
      <ScheduleItemItems
        items={[
          task({ id: 't1', title: 'Wear a collared shirt', assignedTo: 'm-liam' }),
          task({ id: 't2', title: 'Bring the order form', assignedTo: 'm-mia' }),
        ]}
        members={members}
        onToggle={vi.fn()}
        viewedDate={viewedDate}
      />,
    )
    expect(getByText('Wear a collared shirt')).toBeInTheDocument()
    expect(getByText('Bring the order form')).toBeInTheDocument()
    // One check button per item.
    expect(getAllByRole('button', { name: /^Complete / })).toHaveLength(2)
    // The member pill carries the initials.
    expect(getByText('L')).toBeInTheDocument()
    expect(getByText('M')).toBeInTheDocument()
  })

  it('clicking the check calls onToggle with the item id', () => {
    const onToggle = vi.fn()
    const { getByRole } = render(
      <ScheduleItemItems
        items={[task({ id: 't2', title: 'Bring the order form', assignedTo: 'm-mia' })]}
        members={members}
        onToggle={onToggle}
        viewedDate={viewedDate}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'Complete Bring the order form' }))
    expect(onToggle).toHaveBeenCalledWith('t2')
  })

  it('shows "tonight" when the item is needed the day before the viewed day', () => {
    const { getByText } = render(
      <ScheduleItemItems
        items={[task({ id: 't1', assignedTo: 'm-liam', neededOn: new Date('2026-09-09T00:00:00') })]}
        members={members}
        viewedDate={viewedDate}
      />,
    )
    expect(getByText('tonight')).toBeInTheDocument()
  })

  it('shows "today" when the item is needed on the viewed day', () => {
    const { getByText } = render(
      <ScheduleItemItems
        items={[task({ id: 't1', assignedTo: 'm-liam', neededOn: new Date('2026-09-10T00:00:00') })]}
        members={members}
        viewedDate={viewedDate}
      />,
    )
    expect(getByText('today')).toBeInTheDocument()
  })

  it('shows no hint for any other needed-on date, or none at all', () => {
    const { queryByText } = render(
      <ScheduleItemItems
        items={[
          task({ id: 't1', assignedTo: 'm-liam', neededOn: new Date('2026-09-01T00:00:00') }),
          task({ id: 't2', title: 'No date at all', assignedTo: 'm-mia' }),
        ]}
        members={members}
        viewedDate={viewedDate}
      />,
    )
    expect(queryByText('tonight')).toBeNull()
    expect(queryByText('today')).toBeNull()
  })

  // Adjacent checks used to overlap: the button carried `margin: -8` to claw
  // back a 32px box out of a 16px circle, so on a phone one kid's hit area ran
  // under the next kid's row and a tap in the seam completed the wrong item.
  // The row now reserves the height (min-h-11) and the button pads out to a
  // 40px box that stays inside it.
  it('gives each check a padded tap box with no negative margin', () => {
    const { getAllByRole, container } = render(
      <ScheduleItemItems
        items={[
          task({ id: 't1', title: 'Wear a collared shirt', assignedTo: 'm-liam' }),
          task({ id: 't2', title: 'Bring the order form', assignedTo: 'm-mia' }),
        ]}
        members={members}
        onToggle={vi.fn()}
        viewedDate={viewedDate}
      />,
    )

    for (const button of getAllByRole('button', { name: /^Complete / })) {
      const style = (button as HTMLElement).style
      expect(style.padding).toBe('12px')
      // Any negative margin re-creates the overlap this test exists to stop.
      expect(style.margin).not.toMatch(/-/)
      expect(style.marginTop).not.toMatch(/-/)
      expect(style.marginLeft).not.toMatch(/-/)
    }

    // And the row itself reserves the height, so the boxes cannot collide.
    for (const li of container.querySelectorAll('li')) {
      expect(li.className).toContain('min-h-11')
    }
  })

  it('renders nothing when there are no items', () => {
    const { container } = render(
      <ScheduleItemItems items={[]} members={members} viewedDate={viewedDate} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
