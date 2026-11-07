import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  // Final review (2026-11-04): F in a menu or a dialog is the menu's letter.
  it('F does nothing while focus is in a menu, a dialog, a <dialog> or editable text', () => {
    renderFold()
    const host = document.createElement('div')
    host.innerHTML = '<div role="menu"><button id="in-menu">Show done</button></div>'
      + '<div role="dialog"><button id="in-dialog">OK</button></div>'
      + '<dialog open><button id="in-native">Close</button></dialog>'
      + '<div contenteditable="true"><span id="in-edit" tabindex="0">text</span></div>'
    document.body.appendChild(host)
    try {
      for (const id of ['in-menu', 'in-dialog', 'in-native', 'in-edit']) {
        const el = document.getElementById(id)!
        el.focus()
        fireEvent.keyDown(el, { key: 'f' })
        expect(edge(), id).toHaveAttribute('aria-expanded', 'false')
      }
      // Focus back on the page: F folds again.
      ;(document.activeElement as HTMLElement | null)?.blur()
      fireEvent.keyDown(document, { key: 'f' })
      expect(edge()).toHaveAttribute('aria-expanded', 'true')
    } finally { host.remove() }
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

// Task 5c (Scott, 2026-11-04: "yes, add the calendar fold on the right"): this
// period's calendar folds out on the right edge, mirrored, with its own
// memory (symphony-fold:<horizon>:calendar) and key (C). Both open when the
// spread fits; otherwise opening one folds the other.
describe('PaperFold: the calendar on the right', () => {
  function renderCal(props: Partial<Parameters<typeof PaperFold>[0]> = {}) {
    return renderFold({
      calendar: <ul><li>Thanksgiving</li></ul>,
      calendarLabel: 'November calendar',
      ...props,
    })
  }
  const calEdge = () => screen.getByRole('button', { name: /November calendar/ })
  const calRegion = (c: HTMLElement) => c.querySelector('.paper-fold-slot--calendar .paper-fold-front') as HTMLElement
  const calFlap = (c: HTMLElement) => c.querySelector('.paper-fold-slot--calendar .paper-fold-flap') as HTMLElement

  it('shows a second edge; folded, the calendar is unreachable', () => {
    const { container } = renderCal()
    expect(calEdge()).toHaveAccessibleName('November calendar. Unfold to read')
    expect(calEdge()).toHaveAttribute('aria-expanded', 'false')
    expect(calRegion(container)).toHaveAttribute('inert')
    expect(calRegion(container)).toHaveAttribute('aria-hidden', 'true')
    expect(calRegion(container)).toHaveAttribute('aria-label', 'November calendar, for reading')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
    // Mirrored: hinged on this sheet's right edge, after it.
    const current = container.querySelector('.paper-fold-current')!
    expect(current.compareDocumentPosition(calEdge()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calFlap(container).style.transform).toBe('rotateY(180.00deg)')
  })

  it('Enter unfolds it, revealing what it holds, and remembers it apart from the sheet above', () => {
    const { container } = renderCal()
    fireEvent.keyDown(calEdge(), { key: 'Enter' })
    expect(calEdge()).toHaveAccessibleName('Fold November calendar away')
    expect(calRegion(container)).not.toHaveAttribute('inert')
    expect(within(calRegion(container)).getByText('Thanksgiving')).toBeVisible()
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBe('open')
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
    expect(paperSound.land).toHaveBeenCalledWith(0.6)
  })

  it('mounts open when remembered', () => {
    localStorage.setItem('symphony-fold:month:calendar', 'open')
    const { container } = renderCal()
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
  })

  // Scott, 2026-11-07: the Mac app (WebKit) would not scroll a list inside a
  // 3D-turned sheet. Open and at rest, the sheet lies flat; folded, it is turned.
  it('an open sheet at rest lies flat (no 3D); a folded one is turned', () => {
    localStorage.setItem('symphony-fold:month:calendar', 'open')
    const { container } = renderCal()
    expect(calFlap(container)).toHaveAttribute('data-flat')
    expect(calFlap(container).style.transform).toBe('none')
    localStorage.removeItem('symphony-fold:month:calendar')
  })
  it('a folded sheet is not flat', () => {
    const { container } = renderCal()
    expect(calFlap(container)).not.toHaveAttribute('data-flat')
  })

  it('C toggles it, but not while typing; F still folds the sheet above', () => {
    const { container } = renderCal()
    fireEvent.keyDown(document, { key: 'c' })
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
    fireEvent.keyDown(document, { key: 'C' })
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
    const input = screen.getByRole('textbox', { name: 'Write a November goal' })
    input.focus()
    fireEvent.keyDown(input, { key: 'c' })
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
    fireEvent.keyDown(document, { key: 'f' })
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
  })

  // The page tours' "above" and "calendar" steps point at the edges.
  it('marks its edges for the page tour: above on the left, calendar on the right', () => {
    const { container } = renderCal()
    const edges = Array.from(container.querySelectorAll('.paper-fold-edge'))
    expect(edges.map((e) => e.getAttribute('data-explain'))).toEqual(['above', 'calendar'])
  })

  it('without a calendar there is no second edge, and C does nothing', () => {
    const { container } = renderFold()
    expect(container.querySelector('.paper-fold-slot--calendar')).toBeNull()
    fireEvent.keyDown(document, { key: 'c' })
    expect(root(container)).not.toHaveAttribute('data-calendar-open', 'true')
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBeNull()
  })

  it('a drag to the right opens it (the mirror of the sheet above)', () => {
    const { container } = renderCal()
    const b = calEdge()
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 200, clientY: 300 })
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 220, clientY: 300 })
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 240, clientY: 300 })
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 240, clientY: 300 })
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
  })

  it('at 1316px both can be open: a planner spread', () => {
    setViewport(1316)
    const { container } = renderCal()
    fireEvent.keyDown(edge(), { key: 'Enter' })
    fireEvent.keyDown(calEdge(), { key: 'Enter' })
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
  })

  it('at 820px opening the calendar folds the sheet above, and the other way round', () => {
    setViewport(820)
    const { container } = renderCal()
    fireEvent.keyDown(edge(), { key: 'Enter' })
    fireEvent.keyDown(calEdge(), { key: 'Enter' })
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
    // The reader's choice: what it folded is remembered folded.
    expect(localStorage.getItem('symphony-fold:month')).toBe('folded')
    fireEvent.keyDown(edge(), { key: 'Enter' })
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
  })

  it('at 820px, both remembered open: the sheet above keeps its place', () => {
    setViewport(820)
    localStorage.setItem('symphony-fold:month', 'open')
    localStorage.setItem('symphony-fold:month:calendar', 'open')
    const { container } = renderCal()
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
  })

  it('v: the calendar folds up from below the sheet', () => {
    setViewport(390, 844)
    const { container } = renderCal()
    expect(root(container)).toHaveAttribute('data-fold-mode', 'v')
    const current = container.querySelector('.paper-fold-current')!
    expect(current.compareDocumentPosition(calEdge()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calFlap(container).style.transform).toBe('rotateX(-180.00deg)')
    fireEvent.keyDown(edge(), { key: 'Enter' })
    fireEvent.keyDown(calEdge(), { key: 'Enter' })
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
  })

  it('duo: one companion at a time; with the calendar open this sheet takes the left page', () => {
    localStorage.setItem('symphony-fold:month', 'open')
    mockMedia({ reduce: true, segments: true })
    const { container } = renderCal()
    const current = container.querySelector('.paper-fold-current')!
    expect(root(container)).toHaveAttribute('data-fold-mode', 'duo')
    expect(current).not.toHaveAttribute('data-duo-page', 'left')
    fireEvent.keyDown(calEdge(), { key: 'Enter' })
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
    expect(current).toHaveAttribute('data-duo-page', 'left')
  })

  it('duo, the calendar remembered open: the book does not open the sheet above over it', () => {
    localStorage.setItem('symphony-fold:month:calendar', 'open')
    mockMedia({ reduce: true, segments: true })
    const { container } = renderCal()
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
  })

  it('leaving Duo folds both', async () => {
    localStorage.setItem('symphony-fold:month:calendar', 'open')
    mockMedia({ reduce: true, segments: true })
    const { container } = renderCal()
    act(() => {
      mockMedia({ reduce: true })
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(root(container)).toHaveAttribute('data-fold-mode', 'h'))
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
    expect(calRegion(container)).toHaveAttribute('inert')
  })
})

// The page can open a companion for a while (the planning ribbon's steps, the
// guide's Today step) without touching what the reader left: `drive`.
describe('PaperFold: driven by the page', () => {
  const view = (drive?: { above?: boolean; calendar?: boolean }) => (
    <PaperFold horizon="month" edgeLabel="Fall 2026" above={<p>above</p>} drive={drive}
      calendar={<p>Thanksgiving</p>} calendarLabel="November calendar">
      <h1>November</h1>
    </PaperFold>
  )

  it('opens what it is told to, with sound, without remembering it; letting go returns to what was remembered', () => {
    mockMedia({ reduce: true })
    const { container, rerender } = render(view())
    expect(root(container)).toHaveAttribute('data-open', 'false')
    rerender(view({ above: true }))
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(paperSound.land).toHaveBeenCalledWith(0.6)
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
    rerender(view({ above: false, calendar: true }))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'true')
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBeNull()
    rerender(view(undefined))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
  })

  it('letting go returns to a remembered open sheet', () => {
    localStorage.setItem('symphony-fold:month', 'open')
    const { container, rerender } = render(view())
    expect(root(container)).toHaveAttribute('data-open', 'true')
    rerender(view({ above: false }))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(localStorage.getItem('symphony-fold:month')).toBe('open')
    rerender(view({}))
    expect(root(container)).toHaveAttribute('data-open', 'true')
  })

  it('with motion, a driven open swishes and springs', async () => {
    mockMedia({ reduce: false })
    const { container, rerender } = render(view())
    rerender(view({ calendar: true }))
    expect(paperSound.swish).toHaveBeenCalledWith(0.34)
    await waitFor(() => expect(root(container)).toHaveAttribute('data-calendar-open', 'true'), { timeout: 3000 })
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBeNull()
  })
})

// Fix round 1 (Task 5c): drive is declarative. Each companion's target is the
// page's word if it gave one, else what the reader left. On a spread with room
// for one, a driven key beats a remembered one, and with both driven the
// calendar wins. Nothing is remembered on the way.
describe('PaperFold: drive at 820px, one companion at a time', () => {
  const view = (drive?: { above?: boolean; calendar?: boolean }) => (
    <PaperFold horizon="month" edgeLabel="Fall 2026" above={<p>above</p>} drive={drive}
      calendar={<p>Thanksgiving</p>} calendarLabel="November calendar">
      <h1>November</h1>
    </PaperFold>
  )
  const state = (c: HTMLElement) => [root(c).dataset.open, root(c).dataset.calendarOpen]
  beforeEach(() => setViewport(820))

  it('remembered open, the other driven open, then released: the remembered one opens again', () => {
    localStorage.setItem('symphony-fold:month', 'open')
    const { container, rerender } = render(view())
    expect(state(container)).toEqual(['true', 'false'])
    rerender(view({ calendar: true }))
    expect(state(container)).toEqual(['false', 'true'])
    rerender(view({}))
    expect(state(container)).toEqual(['true', 'false'])
    expect(localStorage.getItem('symphony-fold:month')).toBe('open')
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBeNull()
  })

  it('the calendar remembered open, the sheet above driven, then released: the calendar opens again', () => {
    localStorage.setItem('symphony-fold:month:calendar', 'open')
    const { container, rerender } = render(view())
    expect(state(container)).toEqual(['false', 'true'])
    rerender(view({ above: true }))
    expect(state(container)).toEqual(['true', 'false'])
    rerender(view(undefined))
    expect(state(container)).toEqual(['false', 'true'])
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBe('open')
  })

  it('both driven: the calendar wins; releasing it, the sheet above still driven holds', () => {
    const { container, rerender } = render(view())
    rerender(view({ above: true, calendar: true }))
    expect(state(container)).toEqual(['false', 'true'])
    rerender(view({ above: true }))
    expect(state(container)).toEqual(['true', 'false'])
    rerender(view({ calendar: true, above: true }))
    rerender(view({ calendar: true }))
    expect(state(container)).toEqual(['false', 'true'])
    rerender(view())
    expect(state(container)).toEqual(['false', 'false'])
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
    expect(localStorage.getItem('symphony-fold:month:calendar')).toBeNull()
  })

  it('an indirect fold makes no swish of its own', () => {
    mockMedia({ reduce: false })
    localStorage.setItem('symphony-fold:month', 'open')
    const { rerender } = render(view())
    rerender(view({ calendar: true }))
    expect(paperSound.swish).toHaveBeenCalledTimes(1)
  })
})

// Scott, 2026-11-04: "it seems impossible to dismiss the november month column
// from the week view, or rather to fold it". The open sheet carries a quiet
// fold tab at its hinge, always visible, mirrored for the calendar.
describe('PaperFold: the fold tab on the open sheet', () => {
  const view = (drive?: { above?: boolean; calendar?: boolean }, driveKey?: string) => (
    <PaperFold horizon="month" edgeLabel="Fall 2026" above={<p>above</p>} drive={drive} driveKey={driveKey}
      calendar={<p>Thanksgiving</p>} calendarLabel="November calendar">
      <h1>November</h1>
    </PaperFold>
  )
  const tab = (name: string) => screen.getByRole('button', { name })
  const tabEl = (c: HTMLElement, cal = false) =>
    c.querySelector(`.paper-fold-slot${cal ? '--calendar' : ':not(.paper-fold-slot--calendar)'} .paper-fold-tab`) as HTMLElement

  it('folded, the tab is out of reach; open, "Fold Fall 2026 away" is the tab, and a click folds it with the sound', () => {
    const { container } = render(view())
    expect(tabEl(container)).toHaveAttribute('aria-hidden', 'true')
    expect(tabEl(container)).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(edge(), { key: 'Enter' })
    const t = tab('Fold Fall 2026 away')
    expect(t).toBe(tabEl(container))
    expect(t).toHaveAttribute('aria-expanded', 'true')
    expect(t).toHaveTextContent('‹')
    fireEvent.click(t)
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(paperSound.land).toHaveBeenCalled()
    expect(localStorage.getItem('symphony-fold:month')).toBe('folded')
  })

  it('the calendar has its mirror, "›"', () => {
    const { container } = render(view())
    fireEvent.keyDown(screen.getByRole('button', { name: /November calendar/ }), { key: 'Enter' })
    const t = tab('Fold November calendar away')
    expect(t).toBe(tabEl(container, true))
    expect(t).toHaveTextContent('›')
    fireEvent.click(t)
    expect(root(container)).toHaveAttribute('data-calendar-open', 'false')
  })

  it('the open edge leaves the tab order, so the tab is the one "Fold … away"', () => {
    const { container } = render(view())
    fireEvent.keyDown(edge(), { key: 'Enter' })
    const theEdge = container.querySelector('.paper-fold-edge') as HTMLElement
    expect(theEdge).toHaveAttribute('aria-hidden', 'true')
    expect(theEdge).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByRole('button', { name: /Fold Fall 2026 away/ })).toHaveLength(1)
  })

  // The reader beats the drive for the current step.
  it('during a drive, the tab folds it and it stays folded through re-renders; nothing is written', () => {
    const { container, rerender } = render(view({ above: true }, 'read'))
    expect(root(container)).toHaveAttribute('data-open', 'true')
    fireEvent.click(tab('Fold Fall 2026 away'))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    rerender(view({ above: true }, 'read'))
    rerender(view({ above: true }, 'read'))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
  })

  it('a later step that drives it opens it again', () => {
    const { container, rerender } = render(view({ above: true }, 'read'))
    fireEvent.click(tab('Fold Fall 2026 away'))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    rerender(view({ above: true }, 'brain-dump'))
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
  })

  it('without a step key, a change in the drive opens it again', () => {
    const { container, rerender } = render(view({ above: true }))
    fireEvent.click(tab('Fold Fall 2026 away'))
    rerender(view({ above: true, calendar: false }))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    rerender(view({}))
    rerender(view({ above: true }))
    expect(root(container)).toHaveAttribute('data-open', 'true')
  })

  it('F and a drag beat the drive too, unremembered; letting go returns to what the reader left before', () => {
    localStorage.setItem('symphony-fold:month', 'open')
    const { container, rerender } = render(view({ above: false }, 'look'))
    expect(root(container)).toHaveAttribute('data-open', 'false')
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(root(container)).toHaveAttribute('data-open', 'true')
    rerender(view({ above: false }, 'look'))
    expect(root(container)).toHaveAttribute('data-open', 'true')
    const t = tab('Fold Fall 2026 away')
    fireEvent.pointerDown(t, { clientX: 300, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(t, { clientX: 520, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(t, { clientX: 520, clientY: 300, pointerId: 1 })
    expect(root(container)).toHaveAttribute('data-open', 'false')
    expect(localStorage.getItem('symphony-fold:month')).toBe('open')
    rerender(view(undefined))
    expect(root(container)).toHaveAttribute('data-open', 'true')
  })

  it('a step that drives nothing is still a session: the reader’s move is not written', () => {
    const { container } = render(view({}, 'energy'))
    fireEvent.keyDown(edge(), { key: 'Enter' })
    expect(root(container)).toHaveAttribute('data-open', 'true')
    expect(localStorage.getItem('symphony-fold:month')).toBeNull()
  })
})
