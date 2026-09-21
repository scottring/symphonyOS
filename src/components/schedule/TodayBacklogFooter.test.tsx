import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodayBacklogFooter } from './TodayBacklogFooter'

// The "Review" door left the footer for the page's ⋯ menu (2026-09-21) —
// TodayInvariant.test.tsx pins it there. Only the perishable "New from email"
// line remains here.
describe('TodayBacklogFooter', () => {
  it('renders nothing when there is no email to review', () => {
    const { container } = render(<TodayBacklogFooter />)
    expect(container).toBeEmptyDOMElement()
  })

  it('never renders a Review link of its own', () => {
    render(<TodayBacklogFooter onReviewEmail={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })

  it('renders "New from email" when the handler is given, and it opens the sheet', async () => {
    const onReviewEmail = vi.fn()
    const user = userEvent.setup()
    render(<TodayBacklogFooter onReviewEmail={onReviewEmail} />)
    await user.click(screen.getByRole('button', { name: 'New from email' }))
    expect(onReviewEmail).toHaveBeenCalledTimes(1)
  })

  // House rule: no counts on Today, ever. The footer is a door, not a readout.
  it('never prints a number', () => {
    const { container } = render(<TodayBacklogFooter onReviewEmail={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\d/)
  })
})
