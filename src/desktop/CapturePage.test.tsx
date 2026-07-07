import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CapturePage } from './CapturePage'

const mockInsert = vi.fn().mockResolvedValue(true)
vi.mock('./captureInsert', () => ({
  insertInboxTask: (userId: string, title: string) => mockInsert(userId, title),
}))

const mockEmit = vi.fn()
vi.mock('@/lib/desktop', () => ({
  desktopEmit: (event: string, payload?: unknown) => mockEmit(event, payload),
  onDesktopEvent: () => () => {},
  isDesktopShell: () => true,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

describe('CapturePage', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockEmit.mockClear()
  })

  it('renders an autofocused input', () => {
    render(<CapturePage />)
    const input = screen.getByPlaceholderText('Add to inbox…')
    expect(input).toHaveFocus()
  })

  it('inserts on Enter, clears, and asks the shell to close', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    const input = screen.getByPlaceholderText('Add to inbox…')
    await user.type(input, 'buy milk{Enter}')
    await waitFor(() => expect(mockInsert).toHaveBeenCalledWith('user-1', 'buy milk'))
    expect(input).toHaveValue('')
    expect(mockEmit).toHaveBeenCalledWith('capture:close', undefined)
  })

  it('does not insert empty titles', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.type(screen.getByPlaceholderText('Add to inbox…'), '   {Enter}')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('asks the shell to close on Escape without inserting', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.type(screen.getByPlaceholderText('Add to inbox…'), 'half a thought{Escape}')
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith('capture:close', undefined)
  })
})
