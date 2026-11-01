import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PeriodSummaryLine } from './PeriodSummaryLine'

describe('PeriodSummaryLine', () => {
  it('joins planned day, energy and looked back', () => {
    const { container } = render(<PeriodSummaryLine plannedAt="2026-11-01T10:00" energy={{ level: 'medium' }} reviewed />)
    expect(container.textContent).toBe('Planned Sun · energy: medium · looked back')
  })

  it('shows only what exists', () => {
    const { container } = render(<PeriodSummaryLine energy={{ level: 'low' }} />)
    expect(container.textContent).toBe('energy: low')
  })

  it('renders nothing when empty', () => {
    const { container } = render(<PeriodSummaryLine />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the part tapped', () => {
    const onOpen = vi.fn()
    render(<PeriodSummaryLine energy={{ level: 'high' }} reviewed onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'energy: high' }))
    fireEvent.click(screen.getByRole('button', { name: 'looked back' }))
    expect(onOpen).toHaveBeenNthCalledWith(1, 'energy')
    expect(onOpen).toHaveBeenNthCalledWith(2, 'review')
  })
})
