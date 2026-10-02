import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useColumnsFitWindow } from './useColumnsFitWindow'

function Grid({ shown = true }: { shown?: boolean }) {
  const ref = useColumnsFitWindow()
  return shown ? <div ref={ref} data-testid="grid" /> : <p>Nothing on this week yet.</p>
}

function mount({ wide }: { wide: boolean }) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: wide, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }))
  const scroller = document.createElement('div')
  scroller.style.overflowY = 'auto'
  Object.defineProperty(scroller, 'clientHeight', { value: 1000 })
  scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
  document.body.appendChild(scroller)
  const view = render(<Grid />, { container: scroller })
  const grid = view.getByTestId('grid')
  return { scroller, grid, view }
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('useColumnsFitWindow', () => {
  it('gives side-by-side columns the room from the grid to the landscape', async () => {
    const { scroller, grid } = mount({ wide: true })
    grid.getBoundingClientRect = () => ({ top: 200 }) as DOMRect
    // The landscape writes its height after the first layout.
    scroller.style.setProperty('--scenery-clearance', '300px')
    await new Promise((r) => setTimeout(r, 0))
    // 1000 window − 200 above the grid − 300 landscape − 12 gap.
    expect(grid.style.getPropertyValue('--pv2-col-h')).toBe('488px')
  })

  it('never shrinks a column below a usable height', async () => {
    const { scroller, grid } = mount({ wide: true })
    grid.getBoundingClientRect = () => ({ top: 600 }) as DOMRect
    scroller.style.setProperty('--scenery-clearance', '300px')
    await new Promise((r) => setTimeout(r, 0))
    expect(grid.style.getPropertyValue('--pv2-col-h')).toBe('360px')
  })

  it('measures a grid that appears after the page did', () => {
    const { scroller, view } = mount({ wide: true })
    view.rerender(<Grid shown={false} />)
    scroller.style.setProperty('--scenery-clearance', '300px')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect)
    view.rerender(<Grid />)
    expect(view.getByTestId('grid').style.getPropertyValue('--pv2-col-h')).toBe('488px')
  })

  it('leaves stacked columns to the page scroll', () => {
    const { grid } = mount({ wide: false })
    expect(grid.style.getPropertyValue('--pv2-col-h')).toBe('')
  })
})
