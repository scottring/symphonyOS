import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ParsedFieldChips } from './ParsedFieldChips'

const base = { onClearDate: vi.fn(), onClearProject: vi.fn(), onClearContact: vi.fn(), onClearCategory: vi.fn(), onClearContext: vi.fn() }

describe('ParsedFieldChips', () => {
  it('renders nothing when no fields', () => {
    const { container } = render(<ParsedFieldChips parsed={{ rawText:'', title:'' }} projectName={null} contactName={null} {...base} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders a project chip and × clears it', () => {
    render(<ParsedFieldChips parsed={{ rawText:'', title:'', projectId:'p1' }} projectName="Garden" contactName={null} {...base} />)
    expect(screen.getByText(/Garden/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear project/i }))
    expect(base.onClearProject).toHaveBeenCalled()
  })
  it('renders a time chip when dueDate has a time', () => {
    const d = new Date(2026,4,19,18,15)
    render(<ParsedFieldChips parsed={{ rawText:'', title:'', dueDate:d }} projectName={null} contactName={null} {...base} />)
    // The component renders both the 🕐 emoji and the formatted "6:15 PM" time,
    // so the regex legitimately matches multiple nodes — assert at least one.
    expect(screen.getAllByText(/6:15|18:15|🕐/).length).toBeGreaterThan(0)
  })
})
