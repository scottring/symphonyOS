import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ConceptIcon, CONCEPT_ICONS } from './conceptIcons'

describe('ConceptIcon', () => {
  it('renders an svg for every concept in the map', () => {
    for (const name of Object.keys(CONCEPT_ICONS) as (keyof typeof CONCEPT_ICONS)[]) {
      const { container, unmount } = render(<ConceptIcon name={name} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })
  it('non-decorative has an accessible name (defaults to humanized concept)', () => {
    render(<ConceptIcon name="when" />)
    expect(screen.getByRole('img', { name: /when/i })).toBeInTheDocument()
  })
  it('explicit aria-label wins', () => {
    render(<ConceptIcon name="person" aria-label="Assign person" />)
    expect(screen.getByRole('img', { name: 'Assign person' })).toBeInTheDocument()
  })
  it('decorative is aria-hidden and exposes no accessible name', () => {
    const { container } = render(<ConceptIcon name="note" decorative />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
  it('applies size and className', () => {
    const { container } = render(<ConceptIcon name="task" size={28} className="text-red-500" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('28')
    expect(svg.classList.contains('text-red-500')).toBe(true)
  })
})
