import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ParsedFieldChips } from './ParsedFieldChips'

const base = { onClearDate: vi.fn(), onClearContact: vi.fn(), onClearCategory: vi.fn(), onClearContext: vi.fn() }

describe('ParsedFieldChips', () => {
  it('renders nothing when no fields', () => {
    const { container } = render(<ParsedFieldChips parsed={{ rawText:'', title:'' }} contactName={null} {...base} />)
    expect(container).toBeEmptyDOMElement()
  })
  // Projects are hidden from the product (2026-09-02 — see the note in
  // Sidebar.tsx). useQuickParse still resolves `#garden` to a projectId; capture
  // just no longer says so, and a lone parsed project draws no chips at all.
  it('draws no project chip when the parse resolved one', () => {
    const { container } = render(<ParsedFieldChips parsed={{ rawText:'', title:'', projectId:'p1' }} contactName={null} {...base} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /clear project/i })).not.toBeInTheDocument()
  })
  it('renders a repeat chip for a recurrence, with its own clear', async () => {
    const onClearRecurrence = vi.fn()
    const { user } = render(
      <ParsedFieldChips
        parsed={{ rawText:'', title:'', dueDate: new Date(2026,8,10), recurrence: { type:'weekly', days:['tue','thu'] } }}
        contactName={null}
        {...base}
        onClearRecurrence={onClearRecurrence}
      />,
    )
    expect(screen.getByText('Every Tue, Thu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear repeat/i }))
    expect(onClearRecurrence).toHaveBeenCalledTimes(1)
  })
  it('renders a time chip when dueDate has a time', () => {
    const d = new Date(2026,4,19,18,15)
    render(<ParsedFieldChips parsed={{ rawText:'', title:'', dueDate:d }} contactName={null} {...base} />)
    // The component renders the formatted "6:15 PM" time text (icon is now a ConceptIcon, not emoji).
    // Assert the time text is present.
    expect(screen.getAllByText(/6:15|18:15/).length).toBeGreaterThan(0)
  })
})
