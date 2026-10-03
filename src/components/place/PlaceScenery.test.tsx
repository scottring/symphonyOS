import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PlaceScenery, FAINT_SCENERY_QUERY } from './PlaceScenery'
import { keepFocusAboveScenery } from './sceneryFocus'

describe('foreground scenery', () => {
  it('contains only decorative art, not focusable controls', () => {
    const { container } = render(<PlaceScenery scroller={null} />)
    const scenery = container.querySelector('[data-place-scenery]')!
    expect(scenery).toHaveAttribute('aria-hidden', 'true')
    expect(scenery.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
    expect(scenery.querySelectorAll('img')).toHaveLength(1)
    expect(scenery).toHaveAttribute('data-place-scenery', 'cabin')
  })
  it('scrolls a keyboard-focused control out of the concealed bottom region', () => {
    const scroller = document.createElement('div')
    const input = document.createElement('input')
    scroller.append(input)
    scroller.getBoundingClientRect = () => ({bottom:900} as DOMRect)
    input.getBoundingClientRect = () => ({bottom:840} as DOMRect)
    const detach = keepFocusAboveScenery(scroller, 180)
    input.dispatchEvent(new FocusEvent('focusin', {bubbles:true}))
    expect(scroller.scrollTop).toBe(136)
    detach()
    input.dispatchEvent(new FocusEvent('focusin', {bubbles:true}))
    expect(scroller.scrollTop).toBe(136)
  })
  it('does not move content that is already above the fade', () => {
    const scroller = document.createElement('div')
    const input = document.createElement('input')
    scroller.append(input)
    scroller.getBoundingClientRect = () => ({bottom:900} as DOMRect)
    input.getBoundingClientRect = () => ({bottom:400} as DOMRect)
    const detach = keepFocusAboveScenery(scroller, 180)
    input.dispatchEvent(new FocusEvent('focusin', {bubbles:true}))
    expect(scroller.scrollTop).toBe(0)
    detach()
  })
  it('reads a measured clearance at focus time', () => {
    const scroller = document.createElement('div')
    const input = document.createElement('input')
    scroller.append(input)
    scroller.getBoundingClientRect = () => ({bottom:900} as DOMRect)
    input.getBoundingClientRect = () => ({bottom:700} as DOMRect)
    let covered = 100
    const detach = keepFocusAboveScenery(scroller, () => covered)
    input.dispatchEvent(new FocusEvent('focusin', {bubbles:true}))
    expect(scroller.scrollTop).toBe(0)
    covered = 300
    input.dispatchEvent(new FocusEvent('focusin', {bubbles:true}))
    expect(scroller.scrollTop).toBe(116)
    detach()
  })
  it('gives the scroller its clearance and takes it back when hidden', () => {
    const scroller = document.createElement('div')
    const { unmount } = render(<PlaceScenery scroller={scroller} />)
    expect(scroller.style.getPropertyValue('--scenery-clearance')).toMatch(/^\d+px$/)
    unmount()
    expect(scroller.style.getPropertyValue('--scenery-clearance')).toBe('')
  })
  it('shows the chosen lighting of the painted landscape', () => {
    localStorage.setItem('symphony-scenery-lighting', 'dusk-dawn')
    const { container } = render(<PlaceScenery scroller={null} />)
    expect(container.querySelector('[data-place-scenery]')).toHaveAttribute('data-lighting', 'dusk-dawn')
    expect(container.querySelector('img')!.getAttribute('src')).toContain('painted/cabin-dusk-dawn')
    localStorage.removeItem('symphony-scenery-lighting')
  })
  it('detaches the focus listener on unmount', () => {
    const scroller=document.createElement('div')
    const remove=vi.spyOn(scroller,'removeEventListener')
    const {unmount}=render(<PlaceScenery scroller={scroller}/>)
    unmount()
    expect(remove).toHaveBeenCalledWith('focusin', expect.any(Function))
  })
  // Scott, 2026-10-03: on a laptop the landscape took a quarter of the
  // window; there it stands faint behind the page and holds back only a margin.
  it('on a short desktop window stands faint and holds back only a small margin', () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q === FAINT_SCENERY_QUERY, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    const scroller = document.createElement('div')
    const { container, unmount } = render(<PlaceScenery scroller={scroller} />)
    expect(container.querySelector('[data-place-scenery]')).toHaveClass('is-faint')
    expect(scroller.style.getPropertyValue('--scenery-clearance')).toBe('16px')
    unmount()
    window.matchMedia = original
  })
  // Scott, 2026-10-03: "I may like the higher transparency, low opacity
  // look better than the default" — faint is the default; full is a choice.
  it('is faint by default, and full when chosen on a tall window', () => {
    const { container, unmount } = render(<PlaceScenery scroller={null} />)
    expect(container.querySelector('[data-place-scenery]')).toHaveClass('is-faint')
    unmount()
    localStorage.setItem('symphony-scenery-scene', 'full')
    const full = render(<PlaceScenery scroller={null} />)
    expect(full.container.querySelector('[data-place-scenery]')).not.toHaveClass('is-faint')
    full.unmount()
    localStorage.removeItem('symphony-scenery-scene')
  })
})
