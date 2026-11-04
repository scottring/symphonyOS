import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PeriodSummaryLine } from './PeriodSummaryLine'

describe('PeriodSummaryLine', () => {
  it('joins planned date, the level’s review and energy in plain words', () => {
    const { container } = render(<PeriodSummaryLine level="week" plannedAt="2026-11-02T10:00" energy={{ level: 'medium' }} reviewed />)
    expect(container.textContent).toBe('Planned Mon, Nov 2 · Last week’s review · Energy: medium')
    expect(container.textContent).not.toMatch(/looked back/i)
  })

  it.each([
    ['day', 'Yesterday’s review'], ['week', 'Last week’s review'], ['month', 'Last month’s review'],
    ['season', 'Last season’s review'], ['year', 'Last year’s review'],
  ] as const)('names the %s review', (level, text) => {
    const { container } = render(<PeriodSummaryLine level={level} reviewed />)
    expect(container.textContent).toBe(text)
  })

  it('shows only what exists', () => {
    const { container } = render(<PeriodSummaryLine level="week" energy={{ level: 'low' }} />)
    expect(container.textContent).toBe('Energy: low')
  })

  it('renders nothing when empty', () => {
    const { container } = render(<PeriodSummaryLine level="week" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the part tapped', () => {
    const onOpen = vi.fn()
    render(<PeriodSummaryLine level="month" energy={{ level: 'high' }} reviewed onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Energy: high' }))
    fireEvent.click(screen.getByRole('button', { name: 'Last month’s review' }))
    expect(onOpen).toHaveBeenNthCalledWith(1, 'energy')
    expect(onOpen).toHaveBeenNthCalledWith(2, 'review')
  })

  it('leaves the date plain text', () => {
    render(<PeriodSummaryLine level="week" plannedAt="2026-11-02T10:00" reviewed onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Planned/ })).toBeNull()
  })
})
