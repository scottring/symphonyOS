import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelShell } from './PanelShell'

describe('PanelShell', () => {
  it('renders zones in the fixed order regardless of prop order', () => {
    const { container } = render(
      <PanelShell
        footer={<p>zone-footer</p>}
        identity={<p>zone-identity</p>}
        related={<p>zone-related</p>}
        act={<p>zone-act</p>}
        details={<p>zone-details</p>}
        classify={<p>zone-classify</p>}
      />,
    )
    const order = [...container.querySelectorAll('p')].map((n) => n.textContent)
    expect(order).toEqual([
      'zone-identity', 'zone-act', 'zone-classify',
      'zone-details', 'zone-related', 'zone-footer',
    ])
  })

  // The panel also carries a decorative place wash (aria-hidden). It is not a
  // zone, so the ghost-divider guard counts everything BUT it.
  const zoneChildren = (container: HTMLElement) =>
    [...container.querySelector('article')!.children]
      .filter((el) => el.getAttribute('aria-hidden') !== 'true')

  it('renders no wrapper for an omitted zone, so no ghost divider appears', () => {
    const { container } = render(<PanelShell identity={<p>only</p>} />)
    expect(zoneChildren(container)).toHaveLength(1)
  })

  it('treats a zone rendering null as omitted', () => {
    const { container } = render(
      <PanelShell identity={<p>only</p>} act={null} details={undefined} />,
    )
    expect(zoneChildren(container)).toHaveLength(1)
  })

  it('renders children outside the divided flow', () => {
    render(<PanelShell identity={<p>id</p>}><div data-testid="overlay" /></PanelShell>)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })
})
