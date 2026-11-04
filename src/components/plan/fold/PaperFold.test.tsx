import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaperFold } from '@/components/plan/fold/PaperFold'
import { paperSound } from '@/lib/fold/paperSound'

vi.mock('@/lib/fold/paperSound', () => ({
  paperSound: {
    on: true,
    setOn: vi.fn(),
    swish: vi.fn(),
    crinkle: vi.fn(),
    land: vi.fn(),
    pencil: vi.fn(),
  },
}))

const originalMatchMedia = window.matchMedia
const originalWidth = window.innerWidth
const originalHeight = window.innerHeight

function mockMedia(on: { reduce?: boolean; coarse?: boolean; segments?: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches:
      (query.includes('prefers-reduced-motion') && !!on.reduce) ||
      (query.includes('pointer: coarse') && !!on.coarse) ||
      (query.includes('viewport-segments') && !!on.segments),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function setViewport(width: number, height = 900) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height })
}

function renderFold(props: Partial<Parameters<typeof PaperFold>[0]> = {}) {
  return render(
    <PaperFold
      horizon="month"
      edgeLabel="Fall 2026"
      edgeCount={17}
      above={<p>Chore system running for the kids</p>}
      {...props}
    >
      <h1>November</h1>
      <input aria-label="Write a November goal" />
    </PaperFold>,
  )
}

const edge = () => screen.getByRole('button', { name: /Fall 2026/ })
const aboveRegion = (c: HTMLElement) => c.querySelector('.paper-fold-front') as HTMLElement
const root = (c: HTMLElement) => c.querySelector('.paper-fold') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setViewport(1316)
  mockMedia({ reduce: true })
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  setViewport(originalWidth, originalHeight)
})

describe('PaperFold', () => {
  it('starts folded: the edge names the sheet above and the sheet above is unreachable', () => {
    const { container } = renderFold()
    const button = screen.getByRole('button', { name: 'Fall 2026, 17 open. Unfold to read' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    const above = aboveRegion(container)
    expect(above).toHaveAttribute('inert')
    expect(above).toHaveAttribute('aria-hidden', 'true')
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(above.querySelector('.paper-fold-scroll')).not.toBeNull()
  })

  it('omits the count when there is none', () => {
    renderFold({ edgeCount: undefined })
    expect(screen.getByRole('button', { name: 'Fall 2026. Unfold to read' })).toBeInTheDocument()
  })

  it('Enter on the edge unfolds it and remembers that', () => {
    const { container } = renderFold()
    fireEvent.keyDown(edge(), { key: 'Enter' })
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    expect(edge()).toHaveAccessibleName('Fold Fall 2026 away')
    const above = aboveRegion(container)
    expect(above).not.toHaveAttribute('inert')
    expect(above).toHaveAttribute('aria-hidden', 'false')
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(localStorage.getItem('symphony-fold:month')).toBe('open')
    // Reduced motion: no swish, only the landing.
    expect(paperSound.swish).not.toHaveBeenCalled()
    expect(paperSound.land).toHaveBeenCalledWith(0.6)
  })

  it('folding again stores folded', () => {
    renderFold()
    fireEvent.keyDown(edge(), { key: 'Enter' })
    fireEvent.keyDown(edge(), { key: ' ' })
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
    expect(localStorage.getItem('symphony-fold:month')).toBe('folded')
  })

  it('mounts open when open was remembered for this horizon', () => {
    localStorage.setItem('symphony-fold:season', 'open')
    const { container } = renderFold({ horizon: 'season' })
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    expect(aboveRegion(container)).not.toHaveAttribute('inert')
  })

  it('F on the document toggles it, but not while typing in an input', () => {
    renderFold()
    fireEvent.keyDown(document, { key: 'f' })
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'F' })
    expect(edge()).toHaveAttribute('aria-expanded', 'false')

    const input = screen.getByRole('textbox', { name: 'Write a November goal' })
    input.focus()
    fireEvent.keyDown(input, { key: 'f' })
    expect(edge()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(document, { key: 'f', metaKey: true })
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
  })

  it('a press that moves less than 4px is a tap and toggles', () => {
    renderFold()
    const b = edge()
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 97, clientY: 300 })
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 97, clientY: 300 })
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    // The click that follows a handled tap does not toggle it back.
    fireEvent.click(b)
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
  })

  it('a click with no pointer gesture (assistive tech) toggles', () => {
    renderFold()
    fireEvent.click(edge())
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
  })

  it('a 40px drag left then release opens it', () => {
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'h')
    const b = edge()
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 200, clientY: 300 })
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 180, clientY: 300 })
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 160, clientY: 300 })
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 160, clientY: 300 })
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem('symphony-fold:month')).toBe('open')
  })

  it('a drag to the right then release stays folded', () => {
    renderFold()
    const b = edge()
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 200, clientY: 300 })
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 240, clientY: 300 })
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 240, clientY: 300 })
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
  })

  it('with motion, the spring carries it open', async () => {
    mockMedia({ reduce: false })
    const { container } = renderFold()
    fireEvent.keyDown(edge(), { key: 'Enter' })
    expect(paperSound.swish).toHaveBeenCalledWith(0.34)
    expect(paperSound.crinkle).toHaveBeenCalledWith(7, 0.3)
    await waitFor(() => expect(edge()).toHaveAttribute('aria-expanded', 'true'), { timeout: 3000 })
    await waitFor(
      () => expect(parseFloat(root(container).style.getPropertyValue('--p'))).toBe(1),
      { timeout: 3000 },
    )
    expect(paperSound.land).toHaveBeenCalledWith(1)
  })

  it('resizing below 760px switches to the vertical fold', async () => {
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'h')
    act(() => {
      setViewport(700)
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(root(container)).toHaveAttribute('data-fold-mode', 'v'))
  })

  it('opens in Duo when nothing is remembered, and folds instantly on leaving Duo', async () => {
    mockMedia({ reduce: true, segments: true })
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'duo')
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    act(() => {
      mockMedia({ reduce: true })
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(root(container)).toHaveAttribute('data-fold-mode', 'h'))
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
    expect(aboveRegion(container)).toHaveAttribute('inert')
  })

  // Fix round 1 (2026-11-04): Duo used to force the sheet open on every
  // mount. It keeps what the reader left.
  it('mounting in Duo keeps a remembered fold', () => {
    localStorage.setItem('symphony-fold:month', 'folded')
    mockMedia({ reduce: true, segments: true })
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'duo')
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
    expect(aboveRegion(container)).toHaveAttribute('inert')
  })

  it('mounting in Duo keeps a remembered open sheet', () => {
    localStorage.setItem('symphony-fold:month', 'open')
    mockMedia({ reduce: true, segments: true })
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'duo')
    expect(screen.getByRole('button', { name: 'Fold Fall 2026 away' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('entering Duo from the desk still opens the sheet, without remembering it', async () => {
    localStorage.setItem('symphony-fold:month', 'folded')
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'h')
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
    act(() => {
      mockMedia({ reduce: true, segments: true })
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(root(container)).toHaveAttribute('data-fold-mode', 'duo'))
    expect(edge()).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem('symphony-fold:month')).toBe('folded')
  })

  it('an iPad in portrait is not a Duo: it starts folded', () => {
    setViewport(820, 1180)
    mockMedia({ reduce: true, coarse: true })
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'h')
    expect(edge()).toHaveAttribute('aria-expanded', 'false')
  })

  describe('ResizeObserver', () => {
    type Entry = { target: Element; contentRect: { width: number; height: number } }
    let observers: { cb: (entries: Entry[]) => void; targets: Element[] }[] = []
    const originalRO = globalThis.ResizeObserver

    beforeEach(() => {
      observers = []
      globalThis.ResizeObserver = class {
        targets: Element[] = []
        constructor(cb: (entries: Entry[]) => void) {
          observers.push({ cb, targets: this.targets })
        }
        observe(t: Element) {
          this.targets.push(t)
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
    })
    afterEach(() => {
      globalThis.ResizeObserver = originalRO
      vi.restoreAllMocks()
    })

    function countLayouts() {
      const media = window.matchMedia
      const spy = vi.fn((q: string) => media(q))
      window.matchMedia = spy as unknown as typeof window.matchMedia
      // layout() asks for the pointer type once per run.
      return () => spy.mock.calls.filter(([q]) => q.includes('pointer: coarse')).length
    }

    it('does not re-lay out on every frame while the phone fold animates', async () => {
      setViewport(390, 844)
      mockMedia({ reduce: false })
      const layouts = countLayouts()
      const { container } = renderFold()
      const r = root(container)
      expect(r).toHaveAttribute('data-fold-mode', 'v')
      const parent = r.parentElement!
      const aboveBody = container.querySelector('.paper-fold-above')!
      const slot = container.querySelector('.paper-fold-slot') as HTMLElement
      const ro = observers[0]
      expect(ro.targets).toEqual([parent, aboveBody])

      // The first report after mount lays out once.
      act(() =>
        ro.cb([
          { target: parent, contentRect: { width: 358, height: 400 } },
          { target: aboveBody, contentRect: { width: 318, height: 600 } },
        ]),
      )
      const before = layouts()

      // As the browser would: each frame the spread grows, so the parent's height changes.
      const raf = window.requestAnimationFrame.bind(window)
      let frames = 0
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) =>
        raf((ts) => {
          cb(ts)
          frames++
          ro.cb([
            {
              target: parent,
              contentRect: { width: 358, height: 400 + parseFloat(slot.style.height || '0') },
            },
          ])
        }),
      )
      fireEvent.keyDown(edge(), { key: 'Enter' })
      await waitFor(() => expect(parseFloat(r.style.getPropertyValue('--p'))).toBe(1), {
        timeout: 3000,
      })
      expect(frames).toBeGreaterThan(5)
      expect(layouts()).toBe(before)

      // What the layout does read still re-lays out: the parent's width...
      act(() => ro.cb([{ target: parent, contentRect: { width: 300, height: 900 } }]))
      expect(layouts()).toBe(before + 1)
      // ...and, on phones, the sheet above's content height.
      act(() => ro.cb([{ target: aboveBody, contentRect: { width: 318, height: 700 } }]))
      expect(layouts()).toBe(before + 2)
    })
  })
})

// Today while a session runs on the page: the fold is put away, but the day
// on this sheet stays mounted (walk 2026-11-01: the session's way back lives
// in the day page).
describe('PaperFold stowed', () => {
  it('hides the edge, ignores F, and keeps this sheet’s content mounted across stowing', () => {
    const view = (stowed: boolean) => (
      <PaperFold horizon="day" edgeLabel="Fall 2026" edgeCount={2} above={<p>above</p>} stowed={stowed}>
        <input aria-label="The day's own field" />
      </PaperFold>
    )
    const { container, rerender } = render(view(true))
    const field = screen.getByRole('textbox', { name: "The day's own field" })
    expect(screen.queryByRole('button', { name: /Fall 2026/ })).toBeNull()
    expect(root(container)).toHaveAttribute('data-stowed', 'true')
    fireEvent.keyDown(document, { key: 'f' })
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(localStorage.getItem('symphony-fold:day')).toBeNull()
    rerender(view(false))
    expect(edge()).toHaveAccessibleName('Fall 2026, 2 open. Unfold to read')
    expect(screen.getByRole('textbox', { name: "The day's own field" })).toBe(field)
    fireEvent.keyDown(document, { key: 'f' })
    expect(root(container)).toHaveAttribute('data-open', 'true')
  })
})

// Scott, 2026-11-04: "the week scrolls while everything else remains fixed."
// Beside the page ('h', 'duo') the sheet above is pinned under the top bar,
// viewport-tall, and only its own list scrolls: reaching the list's end never
// scrolls the page. On a phone it keeps its capped fold, scrolling inside.
describe('PaperFold: the sheet above stays in view and scrolls on its own', () => {
  const pin = (c: HTMLElement) => c.querySelector('.paper-fold-pin') as HTMLElement
  const scrollBox = (c: HTMLElement) => c.querySelector('.paper-fold-scroll') as HTMLElement

  it('h: the edge and the flap are pinned (sticky) under the top bar, bounded to the viewport', () => {
    setViewport(1316, 900)
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'h')
    expect(pin(container)).toContainElement(edge())
    expect(pin(container)).toContainElement(container.querySelector('.paper-fold-flap') as HTMLElement)
    expect(pin(container).style.position).toBe('sticky')
    expect(pin(container).style.top).toBe('72px') // level with the horizon strip
    expect(pin(container).style.height).toBe('804px') // 900 − 72 − 24
    expect(pin(container).style.maxHeight).toBe('100%')
    expect(scrollBox(container).style.overscrollBehavior).toBe('contain')
  })

  // Fix round 1: the landscape stands at the foot of the scroller
  // (--scenery-clearance, as useColumnsFitWindow reads it), so the sheet ends
  // above it; the room is the scroller's, not the window's.
  it('h: the sheet ends above the landscape, measured in its scroller', () => {
    setViewport(1316, 900)
    const { container } = render(
      <div data-testid="scroller" style={{ overflowY: 'auto', ['--scenery-clearance' as string]: '180px', ['--dock-clearance' as string]: '20px' }}>
        <PaperFold horizon="month" edgeLabel="Fall 2026" above={<p>above</p>}>
          <h1>November</h1>
        </PaperFold>
      </div>,
    )
    const scroller = screen.getByTestId('scroller')
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 850 })
    act(() => { window.dispatchEvent(new Event('resize')) })
    return waitFor(() => expect(pin(container).style.height).toBe('554px')) // 850 − 72 − 180 − 20 − 24
  })

  it('a sheet above can be named for what it is for', () => {
    const { container, unmount } = renderFold({ frontLabel: 'Oct 31 – Nov 6, to pick from' })
    expect(aboveRegion(container)).toHaveAttribute('aria-label', 'Oct 31 – Nov 6, to pick from')
    unmount()
    // Without it, the sheet above is for reading.
    const plain = renderFold()
    expect(aboveRegion(plain.container)).toHaveAttribute('aria-label', 'Fall 2026, for reading')
  })

  it('duo: pinned the same way', () => {
    mockMedia({ reduce: true, segments: true })
    setViewport(1316, 900)
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'duo')
    expect(pin(container).style.position).toBe('sticky')
    expect(scrollBox(container).style.overscrollBehavior).toBe('contain')
  })

  it('v: not pinned; the capped fold scrolls inside without chaining to the page', () => {
    setViewport(390, 844)
    const { container } = renderFold()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'v')
    expect(pin(container).style.position).toBe('')
    expect(scrollBox(container).style.overscrollBehavior).toBe('contain')
  })
})
