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
  it('a typed date overrides the anchor time', () => {
    const onSubmit = vi.fn()
    render(<TimelineQuickInput kind="task" anchorTime={new Date(2026,4,19,18,15)} parserContext={{ projects:[], contacts:[], familyMembers:[] }} currentDomain="universal" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const inp = screen.getByPlaceholderText(/new task ·/i)
    fireEvent.change(inp, { target: { value: 'Call vet tomorrow' } })
    fireEvent.keyDown(inp, { key: 'Enter' })
    const r = onSubmit.mock.calls[0][0]
    expect(r.scheduledFor).toBeInstanceOf(Date)
    // parsed "tomorrow" must NOT equal the anchor (different day)
    expect(r.scheduledFor.getTime()).not.toBe(new Date(2026,4,19,18,15).getTime())
  })
  it('a bare weekday at a slot stays on the slot until you tap Move (safety net)', () => {
    const onSubmit = vi.fn()
    render(<TimelineQuickInput kind="task" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const inp = screen.getByPlaceholderText(/new task ·/i)
    // "Friday" here is a topic word, not a schedule ("about Friday's deck")
    fireEvent.change(inp, { target: { value: "prep Friday's deck" } })
    // A confirm-to-move affordance appears instead of silently rescheduling
    const moveBtn = screen.getByRole('button', { name: /move to/i })
    expect(moveBtn).toBeInTheDocument()
    // Enter keeps it on the tapped slot
    fireEvent.keyDown(inp, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scheduledFor: anchor }))
  })
  it('tapping Move applies the parsed weekday', () => {
    const onSubmit = vi.fn()
    render(<TimelineQuickInput kind="task" anchorTime={anchor} parserContext={pc} currentDomain="universal" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const inp = screen.getByPlaceholderText(/new task ·/i)
    fireEvent.change(inp, { target: { value: "prep Friday's deck" } })
    fireEvent.click(screen.getByRole('button', { name: /move to/i }))
    fireEvent.keyDown(inp, { key: 'Enter' })
    const r = onSubmit.mock.calls[0][0]
    expect(r.scheduledFor.getTime()).not.toBe(anchor.getTime())
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
