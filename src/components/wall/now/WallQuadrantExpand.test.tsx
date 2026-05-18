import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallQuadrantExpand } from './WallQuadrantExpand'
import type { QuadrantContent } from './buildDayGrid'

const content: QuadrantContent = {
  eyebrow: "WHILE IT'S QUIET",
  headline: '3 things waiting',
  lines: [{ text: 'Reply to Caitlin' }, { text: 'Pay water bill', tag: 'overdue' }],
  tap: { quadrant: 'pending' },
}

describe('WallQuadrantExpand', () => {
  it('renders the enlarged quadrant content', () => {
    render(<WallQuadrantExpand content={content} onClose={() => {}} />)
    expect(screen.getByText('3 things waiting')).toBeInTheDocument()
    expect(screen.getByText('Reply to Caitlin')).toBeInTheDocument()
    expect(screen.getByText('Pay water bill')).toBeInTheDocument()
  })

  it('calls onClose when the overlay is tapped', () => {
    const onClose = vi.fn()
    render(<WallQuadrantExpand content={content} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
