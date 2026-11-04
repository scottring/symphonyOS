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

  it('opens in Duo and folds instantly on leaving Duo', async () => {
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
