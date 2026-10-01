import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PlaceScenery } from './PlaceScenery'
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
  it('shows the chosen lighting of the woodblock landscape', () => {
    localStorage.setItem('symphony-scenery-lighting', 'dusk-dawn')
    const { container } = render(<PlaceScenery scroller={null} />)
    expect(container.querySelector('[data-place-scenery]')).toHaveAttribute('data-lighting', 'dusk-dawn')
    expect(container.querySelector('img')!.getAttribute('src')).toContain('woodblock/cabin-dusk-dawn')
    localStorage.removeItem('symphony-scenery-lighting')
  })
  it('detaches the focus listener on unmount', () => {
    const scroller=document.createElement('div')
    const remove=vi.spyOn(scroller,'removeEventListener')
    const {unmount}=render(<PlaceScenery scroller={scroller}/>)
    unmount()
    expect(remove).toHaveBeenCalledWith('focusin', expect.any(Function))
  })
})
