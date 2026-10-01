import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { PlaceGroundStrip, PlaceScenery } from './PlaceScenery'
import { useSceneryContent } from './useSceneryContent'

function scrollerAt(top: number) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollTop', { value: top, writable: true, configurable: true })
  return el
}

function mockReducedMotion(reduce: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  return () => { window.matchMedia = original }
}

describe('PlaceScenery', () => {
  let restore: (() => void) | null = null
  afterEach(() => { restore?.(); restore = null })

  it('is decoration only: hidden from assistive tech, with no text and nothing to focus', () => {
    const { container } = render(<PlaceScenery scroller={null} />)
    const scenery = container.querySelector('[data-place-scenery]') as HTMLElement
    expect(scenery).toHaveAttribute('aria-hidden', 'true')
    expect(scenery.textContent).toBe('')
    expect(scenery.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
    // Both sides draw, as images with empty alt text.
    const art = scenery.querySelectorAll('img')
    expect(art).toHaveLength(2)
    art.forEach((img) => expect(img).toHaveAttribute('alt', ''))
  })

  it('wears the default place outside the provider', () => {
    const { container } = render(<PlaceScenery scroller={null} />)
    expect(container.querySelector('[data-place-scenery]')).toHaveAttribute('data-place-scenery', 'cabin')
  })

  it("follows the page scroller's position", () => {
    const scroller = scrollerAt(200)
    const { container } = render(<PlaceScenery scroller={scroller} />)
    const scenery = container.querySelector('[data-place-scenery]') as HTMLElement
    expect(scenery.style.getPropertyValue('--scenery-progress')).toBe('1')
  })

  it('leaves the veil steady for reduced motion', () => {
    restore = mockReducedMotion(true)
    const scroller = scrollerAt(200)
    const { container } = render(<PlaceScenery scroller={scroller} />)
    const scenery = container.querySelector('[data-place-scenery]') as HTMLElement
    expect(scenery.style.getPropertyValue('--scenery-progress')).toBe('')
  })

  it('stops following the scroller when it unmounts', () => {
    const scroller = scrollerAt(0)
    const remove = vi.spyOn(scroller, 'removeEventListener')
    const { unmount } = render(<PlaceScenery scroller={scroller} />)
    unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})

describe('PlaceGroundStrip', () => {
  it('is decoration only, like the scene behind the page', () => {
    const { container } = render(<PlaceGroundStrip />)
    const strip = container.querySelector('.place-ground-strip') as HTMLElement
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(strip.textContent).toBe('')
    expect(strip.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})

describe('useSceneryContent', () => {
  function Page() { useSceneryContent(); return null }

  it('marks the document while a page with marked content is mounted, and only then', () => {
    const { unmount } = render(<Page />)
    expect(document.documentElement).toHaveClass('has-scenery-content')
    unmount()
    expect(document.documentElement).not.toHaveClass('has-scenery-content')
  })
})
