import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowQuadrant } from './WallNowQuadrant'
import type { QuadrantContent } from './buildDayGrid'

const base: QuadrantContent = {
  eyebrow: 'TODAY',
  headline: 'A quiet afternoon',
  lines: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
  tap: { quadrant: 'today' },
}

describe('WallNowQuadrant', () => {
  it('renders eyebrow and headline', () => {
    render(<WallNowQuadrant content={base} onTap={() => {}} variant="neutral" />)
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    expect(screen.getByText('A quiet afternoon')).toBeInTheDocument()
  })

  it('never renders more than 3 lines', () => {
    render(<WallNowQuadrant content={base} onTap={() => {}} variant="neutral" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.queryByText('D')).not.toBeInTheDocument()
  })

  it('shows the OVERDUE tag on a tagged line only', () => {
    const content: QuadrantContent = {
      ...base,
      lines: [{ text: 'Pay bill', tag: 'overdue' }, { text: 'Plain' }],
    }
    render(<WallNowQuadrant content={content} onTap={() => {}} variant="neutral" />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('fires onTap when the quadrant is tapped', () => {
    const onTap = vi.fn()
    render(<WallNowQuadrant content={base} onTap={onTap} variant="neutral" />)
    fireEvent.click(screen.getByRole('button', { name: /today/i }))
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})
