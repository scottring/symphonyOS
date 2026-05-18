import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowGrid } from './WallNowGrid'
import type { DayGridData } from './buildDayGrid'

const grid: DayGridData = {
  upNext: { eyebrow: 'UP NEXT', headline: 'Soccer practice', lines: [], tap: { quadrant: 'upNext', itemId: 'e1' } },
  today: { eyebrow: 'TODAY', headline: 'A quiet afternoon', lines: [{ text: 'Clean kitchen' }], tap: { quadrant: 'today' } },
  pending: { eyebrow: "WHILE IT'S QUIET", headline: '3 things waiting', lines: [{ text: 'Pay bill', tag: 'overdue' }], tap: { quadrant: 'pending' } },
  familyQuestion: { eyebrow: "TONIGHT'S QUESTION", headline: '"Best part of today?"', lines: [], tap: { quadrant: 'familyQuestion' } },
}

describe('WallNowGrid', () => {
  it('renders all four quadrants', () => {
    render(<WallNowGrid grid={grid} onQuadrantTap={() => {}} />)
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
    expect(screen.getByText('A quiet afternoon')).toBeInTheDocument()
    expect(screen.getByText('3 things waiting')).toBeInTheDocument()
    expect(screen.getByText('"Best part of today?"')).toBeInTheDocument()
  })

  it('forwards the Up Next tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^UP NEXT:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'upNext', itemId: 'e1' })
  })

  it('forwards the Today tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^TODAY:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'today' })
  })

  it('forwards the Pending tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^WHILE IT'S QUIET:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'pending' })
  })

  it('forwards the Family Question tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^TONIGHT'S QUESTION:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'familyQuestion' })
  })
})
