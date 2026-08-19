import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ListItemRow } from './ListItemRow'
import { createMockListItem } from '@/test/mocks/factories'

// Marking a list item "needed today" goes through the row's EXISTING general
// onUpdate({ updates }) prop — not a second, parallel mutation prop — the
// same way editing text/note or toggling completed already does. See
// task-8-brief.md for why this deviates from the original plan.
describe('ListItemRow — needed today', () => {
  it('marks an unmarked item as needed today, writing a Date for today', async () => {
    const onUpdate = vi.fn()
    const item = createMockListItem({ id: 'i1', text: 'Buy milk' })
    const { user } = render(<ListItemRow item={item} onUpdate={onUpdate} />)

    await user.click(screen.getByLabelText('Need today'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const call = onUpdate.mock.calls[0][0]
    expect(call.neededOn).toBeInstanceOf(Date)
    const today = new Date()
    expect(call.neededOn.getFullYear()).toBe(today.getFullYear())
    expect(call.neededOn.getMonth()).toBe(today.getMonth())
    expect(call.neededOn.getDate()).toBe(today.getDate())
  })

  it('clears the mark when an item marked today is clicked again', async () => {
    const onUpdate = vi.fn()
    const item = createMockListItem({ id: 'i1', text: 'Buy milk', neededOn: new Date() })
    const { user } = render(<ListItemRow item={item} onUpdate={onUpdate} />)

    await user.click(screen.getByLabelText('Not needed today'))

    expect(onUpdate).toHaveBeenCalledWith({ neededOn: undefined })
  })

  it('treats an item marked on a different day as unmarked', () => {
    const onUpdate = vi.fn()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const item = createMockListItem({ id: 'i1', text: 'Buy milk', neededOn: yesterday })
    render(<ListItemRow item={item} onUpdate={onUpdate} />)

    // Stale mark from a prior day reads as unmarked — the control still
    // offers "Need today", not "Not needed today".
    expect(screen.getByLabelText('Need today')).toBeInTheDocument()
    expect(screen.queryByLabelText('Not needed today')).not.toBeInTheDocument()
  })

  it('does not render the control when onUpdate is not provided', () => {
    const item = createMockListItem({ id: 'i1', text: 'Buy milk' })
    render(<ListItemRow item={item} onUpdate={undefined} />)

    expect(screen.queryByLabelText('Need today')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Not needed today')).not.toBeInTheDocument()
  })
})
