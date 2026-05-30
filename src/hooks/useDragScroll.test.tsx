import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { useDragScroll } from './useDragScroll'

function Probe() {
  const ref = useDragScroll<HTMLDivElement>()
  return (
    <div ref={ref} data-testid="scroller">
      <button type="button" data-testid="card">card</button>
    </div>
  )
}

// jsdom has no layout, so back scrollTop with a plain field we can read/assert.
function makeScrollable(el: HTMLElement) {
  let top = 0
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => { top = v },
  })
}

function pointer(type: string, clientY: number, pointerId = 1) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clientY', { value: clientY })
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  Object.defineProperty(ev, 'isPrimary', { value: true })
  return ev
}

describe('useDragScroll', () => {
  it('drags to scroll — moving the pointer up raises scrollTop', () => {
    const { getByTestId } = render(<Probe />)
    const el = getByTestId('scroller')
    makeScrollable(el)

    el.dispatchEvent(pointer('pointerdown', 200))
    el.dispatchEvent(pointer('pointermove', 150)) // dy -50 → scrollTop 50
    expect(el.scrollTop).toBe(50)
    el.dispatchEvent(pointer('pointermove', 120)) // dy -80 → scrollTop 80
    expect(el.scrollTop).toBe(80)
    el.dispatchEvent(pointer('pointerup', 120))
  })

  it('suppresses the click after a real drag (so a scroll never taps a card)', () => {
    const { getByTestId } = render(<Probe />)
    const el = getByTestId('scroller')
    makeScrollable(el)
    const card = getByTestId('card')

    // Drag well past the threshold, then the trailing click must be eaten.
    el.dispatchEvent(pointer('pointerdown', 200))
    el.dispatchEvent(pointer('pointermove', 120))
    el.dispatchEvent(pointer('pointerup', 120))

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    card.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it('a tap (under threshold) is not suppressed — cards stay tappable', () => {
    const { getByTestId } = render(<Probe />)
    const el = getByTestId('scroller')
    makeScrollable(el)
    const card = getByTestId('card')

    el.dispatchEvent(pointer('pointerdown', 200))
    el.dispatchEvent(pointer('pointermove', 198)) // 2px — below threshold
    el.dispatchEvent(pointer('pointerup', 198))

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    card.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })
})
