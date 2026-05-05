import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpandingPanel } from './ExpandingPanel'

describe('ExpandingPanel', () => {
  it('renders content (always mounted, content is just clipped)', () => {
    render(
      <ExpandingPanel open={false}>
        <p>banner content</p>
      </ExpandingPanel>
    )
    // Content stays mounted even when collapsed — important for the
    // CSS grid-template-rows trick: the row collapses to 0fr but the
    // child remains in the DOM so `auto`-height can be measured on expand.
    expect(screen.getByText('banner content')).toBeInTheDocument()
  })

  it('sets grid-template-rows to 0fr when closed', () => {
    const { container } = render(
      <ExpandingPanel open={false}>
        <p>banner content</p>
      </ExpandingPanel>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.gridTemplateRows).toBe('0fr')
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
  })

  it('sets grid-template-rows to 1fr when open', () => {
    const { container } = render(
      <ExpandingPanel open={true}>
        <p>banner content</p>
      </ExpandingPanel>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.gridTemplateRows).toBe('1fr')
    expect(wrapper.getAttribute('aria-hidden')).toBe('false')
  })

  it('applies a measurable transition duration so layout shifts smoothly', () => {
    const { container } = render(
      <ExpandingPanel open={true} durationMs={250}>
        <p>banner content</p>
      </ExpandingPanel>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.transitionProperty).toBe('grid-template-rows')
    expect(wrapper.style.transitionDuration).toBe('250ms')
  })

  it('passes through outer className and inner className', () => {
    const { container } = render(
      <ExpandingPanel open={true} className="ml-4" innerClassName="bg-red-50">
        <p>banner content</p>
      </ExpandingPanel>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('ml-4')
    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.className).toContain('bg-red-50')
    // Inner must clip and allow row to fully collapse.
    expect(inner.className).toContain('min-h-0')
    expect(inner.className).toContain('overflow-hidden')
  })
})
