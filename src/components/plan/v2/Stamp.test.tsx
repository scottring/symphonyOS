import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Stamp } from '@/components/plan/v2/Stamp'

describe('Stamp', () => {
  it('words someday as LATER and rings the context', () => {
    const { container } = render(<Stamp kind="someday" context="week of oct 24" />)
    expect(screen.getByRole('img', { name: 'later — week of oct 24' })).toBeInTheDocument()
    expect(container.querySelector('textPath')?.textContent).toContain('LATER · WEEK OF OCT 24 · SYMPHONY')
  })

  it('words dropped as LET GO', () => {
    render(<Stamp kind="dropped" context="oct 24" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^let go — /)
  })

  it('adds is-fresh when fresh', () => {
    render(<Stamp kind="done" context="x" fresh />)
    expect(screen.getByRole('img')).toHaveClass('is-fresh')
  })
})
