import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KioskPaged } from './KioskPaged'
import { nextPageTop } from '@/lib/wall/activity/pageTop'

/** jsdom lays nothing out: give the box and its rows sizes by hand. */
function sized(box: HTMLElement, height: number, contentHeight: number) {
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(box, 'scrollHeight', { configurable: true, value: contentHeight })
}
function rowsAt(box: HTMLElement, rowHeight: number) {
  box.querySelectorAll<HTMLElement>('li').forEach((li, i) => {
    li.getBoundingClientRect = () => {
      const top = i * rowHeight - box.scrollTop
      return { top, bottom: top + rowHeight, height: rowHeight, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }
    }
  })
  box.getBoundingClientRect = () => ({ top: 0, bottom: box.clientHeight, height: box.clientHeight, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) })
}

describe('nextPageTop: a page starts at the row the last one cut', () => {
  it('a row cut at the foot starts the next page', () => {
    const box = document.createElement('div')
    box.innerHTML = '<ul>' + Array.from({ length: 10 }, (_, i) => `<li>${i}</li>`).join('') + '</ul>'
    sized(box, 250, 1000)
    rowsAt(box, 100)
    // Rows at 0,100,200(cut at 250) → the next page starts at 200.
    expect(nextPageTop(box)).toBe(200)
  })
})

describe('KioskPaged', () => {
  it('no pager when everything fits', () => {
    render(<KioskPaged><ul><li>One</li></ul></KioskPaged>)
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull()
  })

  it('Previous and Next when there is more: Next starts at the cut row, Previous goes back', () => {
    const list = <ul>{Array.from({ length: 10 }, (_, i) => <li key={i}>Row {i}</li>)}</ul>
    const { container, rerender } = render(<KioskPaged>{list}</KioskPaged>)
    const box = container.querySelector('.kp-box') as HTMLElement
    sized(box, 250, 1000)
    rowsAt(box, 100)
    rerender(<KioskPaged>{list}</KioskPaged>)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(box.scrollTop).toBe(200)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(box.scrollTop).toBe(0)
  })

  it('a new list starts again at page one', () => {
    const list = <ul>{Array.from({ length: 10 }, (_, i) => <li key={i}>Row {i}</li>)}</ul>
    const { container, rerender } = render(<KioskPaged resetKey="a">{list}</KioskPaged>)
    const box = container.querySelector('.kp-box') as HTMLElement
    sized(box, 250, 1000)
    rowsAt(box, 100)
    rerender(<KioskPaged resetKey="a">{list}</KioskPaged>)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(box.scrollTop).toBe(200)
    rerender(<KioskPaged resetKey="b">{list}</KioskPaged>)
    expect(box.scrollTop).toBe(0)
  })
})
