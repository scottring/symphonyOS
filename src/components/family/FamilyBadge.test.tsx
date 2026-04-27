import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FamilyBadge } from './FamilyBadge'

describe('FamilyBadge', () => {
  it('renders the Family label', () => {
    render(<FamilyBadge />)
    expect(screen.getByText('Family')).toBeInTheDocument()
  })

  it('renders an icon (svg) for at-a-glance recognition', () => {
    const { container } = render(<FamilyBadge />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('uses the amber color stream so it harmonizes with existing family DOMAIN_COLORS', () => {
    const { container } = render(<FamilyBadge />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/amber/)
  })

  it('accepts and applies a size variant prop', () => {
    const { container, rerender } = render(<FamilyBadge size="sm" />)
    const small = container.firstChild as HTMLElement
    const smallClass = small.className
    rerender(<FamilyBadge size="md" />)
    const md = container.firstChild as HTMLElement
    expect(md.className).not.toEqual(smallClass)
  })
})
