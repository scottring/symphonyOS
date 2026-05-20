import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SlotQuickCreatePopover } from './SlotQuickCreatePopover'

const baseProps = {
  anchorRect: { top: 100, left: 100, width: 80, height: 60 },
  startTime: new Date(2026, 4, 20, 13, 0),
  endTime: new Date(2026, 4, 20, 13, 30),
  onCreate: vi.fn(),
  onCancel: vi.fn(),
}

describe('SlotQuickCreatePopover', () => {
  it('renders the time range label', () => {
    render(<SlotQuickCreatePopover {...baseProps} />)
    // e.g. "Wed, May 20 · 1:00 PM–1:30 PM"
    expect(screen.getByText(/1:00/i)).toBeInTheDocument()
    expect(screen.getByText(/1:30/i)).toBeInTheDocument()
  })

  it('autofocuses the title input', () => {
    render(<SlotQuickCreatePopover {...baseProps} />)
    expect(screen.getByPlaceholderText('Title')).toHaveFocus()
  })

  it('disables Create when title is empty', () => {
    render(<SlotQuickCreatePopover {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('enables Create when title has content', async () => {
    const { user } = render(<SlotQuickCreatePopover {...baseProps} />)
    await user.type(screen.getByPlaceholderText('Title'), 'Order shoes')
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled()
  })

  it('calls onCreate with task type by default and trimmed title', async () => {
    const onCreate = vi.fn()
    const { user } = render(<SlotQuickCreatePopover {...baseProps} onCreate={onCreate} />)
    await user.type(screen.getByPlaceholderText('Title'), '  Order shoes  ')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task',
        title: 'Order shoes',
      }),
    )
  })

  it('switches to event type when Event button is clicked', async () => {
    const onCreate = vi.fn()
    const { user } = render(<SlotQuickCreatePopover {...baseProps} onCreate={onCreate} />)
    await user.click(screen.getByRole('button', { name: /event/i }))
    await user.type(screen.getByPlaceholderText('Title'), 'Meeting')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'event' }))
  })

  it('calls onCreate with routine type when Routine is selected', async () => {
    const onCreate = vi.fn()
    const { user } = render(<SlotQuickCreatePopover {...baseProps} onCreate={onCreate} />)
    await user.click(screen.getByRole('button', { name: /routine/i }))
    await user.type(screen.getByPlaceholderText('Title'), 'Morning run')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'routine' }))
  })

  it('shows routine note when routine type is selected', async () => {
    const { user } = render(<SlotQuickCreatePopover {...baseProps} />)
    await user.click(screen.getByRole('button', { name: /routine/i }))
    expect(screen.getByText(/recurrence pattern/i)).toBeInTheDocument()
  })

  it('calls onCancel when Cancel text button is clicked', async () => {
    const onCancel = vi.fn()
    const { user } = render(<SlotQuickCreatePopover {...baseProps} onCancel={onCancel} />)
    // There are two cancel affordances: the X icon (aria-label="Cancel") and the Cancel text button.
    // getAllByRole returns both; click the last one (the text button).
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
    await user.click(cancelButtons[cancelButtons.length - 1])
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when X icon button is clicked', async () => {
    const onCancel = vi.fn()
    const { user } = render(<SlotQuickCreatePopover {...baseProps} onCancel={onCancel} />)
    // X button is the first cancel affordance (aria-label="Cancel")
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
    await user.click(cancelButtons[0])
    expect(onCancel).toHaveBeenCalled()
  })

  it('fires onCreate with type=routine when routine is selected and Create is clicked', async () => {
    const onCreate = vi.fn()
    const { user } = render(
      <SlotQuickCreatePopover
        anchorRect={{ top: 0, left: 0, width: 100, height: 60 }}
        startTime={new Date(2026, 4, 19, 9, 0)}
        endTime={new Date(2026, 4, 19, 9, 30)}
        onCreate={onCreate}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /routine/i }))
    await user.type(screen.getByPlaceholderText(/title/i), 'Yoga')
    await user.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'routine', title: 'Yoga' }))
  })

  it('passes the correct startTime and endTime to onCreate', async () => {
    const onCreate = vi.fn()
    const start = new Date(2026, 4, 20, 14, 0)
    const end = new Date(2026, 4, 20, 14, 30)
    const { user } = render(
      <SlotQuickCreatePopover
        {...baseProps}
        startTime={start}
        endTime={end}
        onCreate={onCreate}
      />,
    )
    await user.type(screen.getByPlaceholderText('Title'), 'Test')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: start, endTime: end }),
    )
  })
})
