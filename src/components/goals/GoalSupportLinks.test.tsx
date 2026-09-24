import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GoalSupportLinks } from './GoalSupportLinks'
import type { SupportLink } from '@/lib/planning/goalSupport'

const season: SupportLink = { id: 'sg1', title: 'A season of repairs', rung: 'season', period: 'Fall 2026' }
const month: SupportLink = { id: 'mg1', title: 'A home easier to care for', rung: 'month', period: 'October' }
const year: SupportLink = { id: 'yg1', title: 'Make the house ours', rung: 'year', period: '2026' }

describe('GoalSupportLinks', () => {
  // One section serves both directions and every rung, so the relationship
  // reads identically on a plan page, a goal's detail page and the year
  // goal's page.
  it('names each linked goal under its period, for either direction', () => {
    const { rerender } = render(<GoalSupportLinks heading="Supports" links={[season]} />)
    expect(screen.getByRole('heading', { name: 'Supports' })).toBeInTheDocument()
    expect(screen.getByText('Fall 2026')).toBeInTheDocument()
    expect(screen.getByText('A season of repairs')).toBeInTheDocument()

    rerender(<GoalSupportLinks heading="Supported by" links={[month, year]} />)
    expect(screen.getByRole('heading', { name: 'Supported by' })).toBeInTheDocument()
    expect(screen.getByText('October')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('draws nothing at all when there is no link — no empty heading', () => {
    const { container } = render(<GoalSupportLinks heading="Supported by" links={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  // The caller routes by rung: a year goal is a goals-table row and opens on
  // its own page, a month or season goal is a task.
  it('hands the whole link back so the caller can route by rung', () => {
    const onOpen = vi.fn()
    render(<GoalSupportLinks heading="Supports" links={[year]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make the house ours' }))
    expect(onOpen).toHaveBeenCalledWith(year)
  })

  it('reads as plain text where there is nowhere to send the reader', () => {
    render(<GoalSupportLinks heading="Supported by" links={[month]} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('A home easier to care for')).toBeInTheDocument()
  })
})
