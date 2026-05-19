import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineQuickInput } from './TimelineQuickInput'

const pc = { projects: [], contacts: [], familyMembers: [] }
const anchor = new Date(2026,4,19,18,15)

describe('TimelineQuickInput', () => {
  it('shows kind + anchor time in the placeholder', () => {
    render(<TimelineQuickInput kind="task" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByPlaceholderText(/new task ·/i)).toBeInTheDocument()
  })
  it('Enter with text submits effective result; no typed time → scheduledFor = anchor', () => {
    const onSubmit = vi.fn()
    render(<TimelineQuickInput kind="task" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const inp = screen.getByPlaceholderText(/new task ·/i)
    fireEvent.change(inp, { target: { value: 'Call vet' } })
    fireEvent.keyDown(inp, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call vet', scheduledFor: anchor }))
  })
  it('empty Enter does nothing; Esc cancels', () => {
    const onSubmit = vi.fn(); const onCancel = vi.fn()
    render(<TimelineQuickInput kind="event" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={onSubmit} onCancel={onCancel} />)
    const inp = screen.getByPlaceholderText(/new event ·/i)
    fireEvent.keyDown(inp, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(inp, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})
