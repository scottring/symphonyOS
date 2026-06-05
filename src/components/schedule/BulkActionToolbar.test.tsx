import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkActionToolbar } from './BulkActionToolbar'

const baseProps = {
  selectedCount: 2,
  onDefer: vi.fn(),
  onSchedule: vi.fn(),
  onSetContext: vi.fn(),
  onAssign: vi.fn(),
  onSendToList: vi.fn(),
  onCancel: vi.fn(),
}

describe('BulkActionToolbar — Group action', () => {
  it('hides the Group button when onGroup is not provided', () => {
    render(<BulkActionToolbar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /group/i })).toBeNull()
  })

  it('opens the name popover and disables Create until a name is typed', () => {
    render(<BulkActionToolbar {...baseProps} onGroup={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^group$/i }))

    const create = screen.getByRole('button', { name: /create group/i })
    expect(create).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/name this group/i), {
      target: { value: 'Sat AM errands' },
    })
    expect(create).toBeEnabled()
  })

  it('calls onGroup with the trimmed name and a default when (today, all-day)', () => {
    const onGroup = vi.fn()
    render(<BulkActionToolbar {...baseProps} onGroup={onGroup} />)
    fireEvent.click(screen.getByRole('button', { name: /^group$/i }))
    fireEvent.change(screen.getByPlaceholderText(/name this group/i), {
      target: { value: '  Sat AM errands  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create group/i }))

    expect(onGroup).toHaveBeenCalledTimes(1)
    expect(onGroup).toHaveBeenCalledWith('Sat AM errands', expect.any(Date), true)
  })

  it('submits the group when Enter is pressed in the name input', () => {
    const onGroup = vi.fn()
    render(<BulkActionToolbar {...baseProps} onGroup={onGroup} />)
    fireEvent.click(screen.getByRole('button', { name: /^group$/i }))
    const input = screen.getByPlaceholderText(/name this group/i)
    fireEvent.change(input, { target: { value: 'Morning run' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onGroup).toHaveBeenCalledTimes(1)
    expect(onGroup).toHaveBeenCalledWith('Morning run', expect.any(Date), true)
  })
})
