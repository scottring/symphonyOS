import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlanNextLine } from './PlanNextLine'

describe('PlanNextLine', () => {
  it('renders the sentence, a text link (not a button) reading "Plan <next> →", and "optional"', () => {
    render(
      <MemoryRouter>
        <PlanNextLine planned="September" message="When you're ready, plan the season with September beside you." nextLabel="the season" to="/season" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/september is planned/i)
    const link = screen.getByRole('link', { name: 'Plan the season →' })
    expect(link).toHaveAttribute('href', '/season')
    expect(screen.getByText('optional')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /plan the season/i })).toBeNull()
  })

  it('lets the week keep its own cta text', () => {
    render(
      <MemoryRouter>
        <PlanNextLine planned="The week" message="Each day, pick from this list." nextLabel="today" cta="Go to Today →" to="/today" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Go to Today →' })).toHaveAttribute('href', '/today')
  })

  it('dismisses via onDismiss when provided, and stays silent when not', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <PlanNextLine planned="September" message="Next up." nextLabel="the season" to="/season" onDismiss={onDismiss} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)

    rerender(
      <MemoryRouter>
        <PlanNextLine planned="September" message="Next up." nextLabel="the season" to="/season" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /not now/i })).toBeNull()
  })
})
