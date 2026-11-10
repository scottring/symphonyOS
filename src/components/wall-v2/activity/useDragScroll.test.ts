import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useDragScroll } from './useDragScroll'

/** A box that holds more than it shows (jsdom lays nothing out). */
function scroller() {
  const root = document.createElement('div')
  const box = document.createElement('div')
  box.style.overflowY = 'auto'
  Object.defineProperty(box, 'scrollHeight', { value: 1000 })
  Object.defineProperty(box, 'clientHeight', { value: 200 })
  const row = document.createElement('button')
  box.appendChild(row); root.appendChild(box); document.body.appendChild(root)
  return { root, box, row }
}

describe('useDragScroll: content moves with a finger that the screen reports as a mouse', () => {
  it('drags the box it starts in', () => {
    const { root, box, row } = scroller()
    renderHook(() => useDragScroll({ current: root }))
    fireEvent.pointerDown(row, { pointerType: 'mouse', button: 0, clientX: 10, clientY: 300 })
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 10, clientY: 180 })
    fireEvent.pointerUp(window, { pointerType: 'mouse' })
    expect(box.scrollTop).toBe(120)
  })

  it('a drag is not a tap: the click after it is swallowed', () => {
    const { root, row } = scroller()
    let clicked = 0
    row.addEventListener('click', () => { clicked++ })
    renderHook(() => useDragScroll({ current: root }))
    fireEvent.pointerDown(row, { pointerType: 'mouse', button: 0, clientX: 10, clientY: 300 })
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 10, clientY: 200 })
    fireEvent.pointerUp(window, { pointerType: 'mouse' })
    fireEvent.click(row)
    expect(clicked).toBe(0)
  })

  it('a tap stays a tap', () => {
    const { root, box, row } = scroller()
    let clicked = 0
    row.addEventListener('click', () => { clicked++ })
    renderHook(() => useDragScroll({ current: root }))
    fireEvent.pointerDown(row, { pointerType: 'mouse', button: 0, clientX: 10, clientY: 300 })
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 12, clientY: 297 })
    fireEvent.pointerUp(window, { pointerType: 'mouse' })
    fireEvent.click(row)
    expect(clicked).toBe(1)
    expect(box.scrollTop).toBe(0)
  })
})
