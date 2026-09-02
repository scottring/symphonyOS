import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodayBacklogFooter } from './TodayBacklogFooter'

describe('TodayBacklogFooter', () => {
  it('renders nothing when there is no backlog and no email to review', () => {
    const { container } = render(
      <TodayBacklogFooter carriedCount={0} attentionItems={[]} onReview={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the Review link when a backlog exists', () => {
    render(<TodayBacklogFooter carriedCount={3} attentionItems={[]} onReview={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('does not render "New from email" without the handler', () => {
    render(<TodayBacklogFooter carriedCount={3} attentionItems={[]} onReview={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'New from email' })).not.toBeInTheDocument()
  })

  it('renders "New from email" next to Review when the handler is given', async () => {
    const onReviewEmail = vi.fn()
    const user = userEvent.setup()
    render(
      <TodayBacklogFooter
        carriedCount={3}
        attentionItems={[]}
        onReview={vi.fn()}
        onReviewEmail={onReviewEmail}
      />,
    )

    const link = screen.getByRole('button', { name: 'New from email' })
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
    await user.click(link)
    expect(onReviewEmail).toHaveBeenCalledTimes(1)
  })

  it('renders "New from email" alone when the backlog is empty', () => {
    render(
      <TodayBacklogFooter
        carriedCount={0}
        attentionItems={[]}
        onReview={vi.fn()}
        onReviewEmail={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'New from email' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })

  // House rule: no counts on Today, ever. The footer is a door, not a readout.
  it('never prints a number', () => {
    const { container } = render(
      <TodayBacklogFooter
        carriedCount={12}
        attentionItems={[]}
        onReview={vi.fn()}
        onReviewEmail={vi.fn()}
      />,
    )
    expect(container.textContent).not.toMatch(/\d/)
  })
})
