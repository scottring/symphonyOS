import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AtAGlance } from './AtAGlance'

describe('AtAGlance', () => {
  it('renders "{N} tasks still open" for plural', () => {
    render(<AtAGlance openTaskCount={3} />)
    expect(screen.getByText(/3 tasks still open/i)).toBeInTheDocument()
  })

  it('uses singular for one task', () => {
    render(<AtAGlance openTaskCount={1} />)
    expect(screen.getByText(/1 task still open/i)).toBeInTheDocument()
  })

  it('renders the all-clear state when zero', () => {
    render(<AtAGlance openTaskCount={0} />)
    expect(screen.getByText(/all clear/i)).toBeInTheDocument()
  })

  it('does not render a View full plan CTA', () => {
    render(<AtAGlance openTaskCount={3} />)
    expect(screen.queryByRole('button', { name: /view full plan/i })).not.toBeInTheDocument()
  })
})
