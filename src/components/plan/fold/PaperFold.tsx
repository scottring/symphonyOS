// Scott, 2026-11-04: paper-style horizons. The level above (the Fall season
// beside November) sits folded behind this period's sheet. Tap or drag its
// edge, or press F, and it swings out on a hinge with a spring and paper
// sounds to lie beside the page, for reading. Ported from the approved
// prototype, docs/superpowers/specs/2026-11-04-paper-fold-prototype.html.
//
// The fold position p (0 folded, 1 open) changes every frame, so it lives in
// refs and is written straight to the DOM (--p, the slot size, the flap's
// rotation). React re-renders only when the sheet crosses halfway (open/closed
// for aria, inert and data-open).

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { springSettled, springStep, releaseTarget } from '@/lib/fold/foldSpring'
import { detectFoldMode, foldSizes, type FoldMode } from '@/lib/fold/foldMode'
import { paperSound } from '@/lib/fold/paperSound'
import './paperFold.css'

export type FoldHorizon = 'year' | 'season' | 'month' | 'week' | 'day'

export interface PaperFoldProps {
  /** Storage key and aria. */
  horizon: FoldHorizon
  /** The sheet above's name on its edge, e.g. "Fall 2026". */
  edgeLabel: string
  /** Open items on the sheet above. */
  edgeCount?: number
  /** Read-only content of the sheet above. */
  above: ReactNode
  /** This period's sheet. */
  children: ReactNode
  className?: string
  /** Put away for now (Today while a session runs on the page): no edge, no
   *  sheet above and no F key, while this sheet stays where it is, so what is
   *  on it is never remounted. */
  stowed?: boolean
  /** The sheet above's accessible name. Default "{edgeLabel}, for reading";
   *  Today's week sheet, which has a + on each row, is "…, to pick from". */
  frontLabel?: string
}

const storageKey = (h: FoldHorizon) => `symphony-fold:${h}`

function readStored(h: FoldHorizon): boolean {
  try {
    return localStorage.getItem(storageKey(h)) === 'open'
  } catch {
    return false
  }
}

/** Has the reader ever opened or folded this horizon here? */
function hasStored(h: FoldHorizon): boolean {
  try {
    const v = localStorage.getItem(storageKey(h))
    return v === 'open' || v === 'folded'
  } catch {
    return false
  }
}

function writeStored(h: FoldHorizon, open: boolean) {
  try {
    localStorage.setItem(storageKey(h), open ? 'open' : 'folded')
  } catch {
    /* private browsing: the fold still works, it just isn't remembered */
  }
}

function mm(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches
  } catch {
    return false
  }
}

const reducedMotion = () => mm('(prefers-reduced-motion: reduce)')

/** The nearest ancestor that scrolls (the shell's .scenery-scroll), or null
 *  when the window does. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

function buzz() {
  try {
    navigator.vibrate?.(6)
  } catch {
    /* no haptics */
  }
}

// ---------- paper grain: made once per page, the prototype's way ----------
const grainCache = new Map<string, string | null>()

function paperGrain(alphaRaw: string): string | null {
  const key = alphaRaw.trim() || '.055'
  if (grainCache.has(key)) return grainCache.get(key) ?? null
  let url: string | null = null
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 180
    const g = c.getContext('2d')
    if (g) {
      const img = g.createImageData(180, 180)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 120 + Math.random() * 135
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = Math.random() < 0.5 ? 255 * (Math.random() * 0.9) : 0
      }
      g.putImageData(img, 0, 0)
      const alpha = parseFloat(key) || 0.05
      const c2 = document.createElement('canvas')
      c2.width = c2.height = 180
      const g2 = c2.getContext('2d')
      if (g2) {
        g2.globalAlpha = alpha
        g2.drawImage(c, 0, 0)
        url = `url(${c2.toDataURL()})`
      }
    }
  } catch {
    url = null // plain paper is fine
  }
  grainCache.set(key, url)
  return url
}

interface Drag {
  x: number
  y: number
  p0: number
  moved: number
  lastPos: number
  lastT: number
  vel: number
  acc: number
}

/** A different horizon in the same spot starts fresh with that horizon's remembered state. */
export function PaperFold(props: PaperFoldProps) {
  return <PaperFoldSheet key={props.horizon} {...props} />
}

function PaperFoldSheet({
  horizon,
  edgeLabel,
  edgeCount,
  above,
  children,
  className,
  stowed = false,
  frontLabel,
}: PaperFoldProps) {
  const [open, setOpen] = useState(() => readStored(horizon))
  const frontId = useId()

  const rootRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const flapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const aboveBodyRef = useRef<HTMLDivElement>(null)

  // The fold's motion state, outside React.
  const initial = open ? 1 : 0
  const m = useRef({
    p: initial,
    v: 0,
    target: initial as 0 | 1,
    raf: 0,
    landed: true,
    last: 0,
    mode: '' as FoldMode | '',
    W: 340,
    H: 300,
    edge: 34,
    open: open,
    drag: null as Drag | null,
    tappedAt: -Infinity,
    // Last sizes the ResizeObserver reported, so it re-lays out only on changes that matter.
    parentW: NaN,
    aboveH: NaN,
  })
  const stowedRef = useRef(stowed)
  useLayoutEffect(() => {
    stowedRef.current = stowed
  }, [stowed])
  const horizonRef = useRef(horizon)
  useLayoutEffect(() => {
    horizonRef.current = horizon
  }, [horizon])

  const apply = useCallback((x: number) => {
    const s = m.current
    const root = rootRef.current
    const slot = slotRef.current
    const flap = flapRef.current
    if (!root || !slot || !flap) return
    const q = Math.max(-0.04, Math.min(1.04, x))
    root.style.setProperty('--p', q.toFixed(4))
    const ang = (1 - q) * 180
    if (s.mode === 'v') {
      slot.style.width = ''
      slot.style.height = `${s.edge + Math.max(0, q) * (s.H - s.edge)}px`
      flap.style.transform = `rotateX(${ang.toFixed(2)}deg)`
    } else {
      slot.style.height = ''
      slot.style.width = `${s.edge + Math.max(0, q) * (s.W - s.edge)}px`
      flap.style.transform = `rotateY(${(-ang).toFixed(2)}deg)`
    }
    flap.style.visibility = q < 0.002 ? 'hidden' : 'visible'
    const isOpen = q > 0.5
    if (isOpen !== s.open) {
      s.open = isOpen
      setOpen(isOpen)
    }
  }, [])

  // One spring frame; it schedules the next itself until the sheet settles.
  const step = useMemo(() => {
    const frame = (ts: number) => {
      const s = m.current
      const dt = Math.min(0.032, (ts - (s.last || ts)) / 1000 || 0.016)
      s.last = ts
      const next = springStep({ p: s.p, v: s.v }, s.target, dt)
      s.p = next.p
      s.v = next.v
      apply(s.p)
      if (!s.landed && Math.abs(s.target - s.p) < 0.03) {
        s.landed = true
        paperSound.land(s.target ? 1 : 0.8)
        buzz()
      }
      if (springSettled({ p: s.p, v: s.v }, s.target)) {
        s.p = s.target
        s.v = 0
        apply(s.p)
        s.raf = 0
        s.last = 0
        return
      }
      s.raf = requestAnimationFrame(frame)
    }
    return frame
  }, [apply])

  const stop = useCallback(() => {
    const s = m.current
    if (s.raf) cancelAnimationFrame(s.raf)
    s.raf = 0
    s.last = 0
  }, [])

  /** Send the sheet toward `to`. `remember` is false when the layout (not the reader) moved it. */
  const go = useCallback(
    (to: 0 | 1, opts: { fromDrag?: boolean; remember?: boolean } = {}) => {
      const s = m.current
      s.target = to
      s.landed = false
      if (opts.remember !== false) writeStored(horizonRef.current, to === 1)
      if (reducedMotion()) {
        stop()
        s.p = to
        s.v = 0
        apply(s.p)
        paperSound.land(0.6)
        s.landed = true
        return
      }
      if (!opts.fromDrag) {
        paperSound.swish(0.34)
        paperSound.crinkle(7, 0.3)
      }
      if (!s.raf) {
        s.last = 0
        s.raf = requestAnimationFrame(step)
      }
    },
    [apply, step, stop],
  )

  const toggle = useCallback(() => go(m.current.target > 0.5 ? 0 : 1), [go])

  // ---------- geometry ----------
  // Beside the page ('h', 'duo') the edge and the sheet above are pinned
  // under the top bar, as tall as the room allows, so a long page scrolls
  // past them and only the sheet's own list scrolls under the pointer (Scott,
  // 2026-11-04: "the week scrolls while everything else remains fixed"). The
  // room is the scroller's: its height, less the landscape standing at its
  // foot (--scenery-clearance) and the bar docked under it (--dock-clearance),
  // as useColumnsFitWindow measures the planning columns. The top bar's height
  // is --paper-fold-sticky-top (72px, level with the horizon strip), with
  // --paper-fold-sticky-gap (24px) left below. On a phone ('v') the sheet
  // folds down from the top, capped, and is not pinned.
  const pinSheet = useCallback((mode: FoldMode | '') => {
    const pin = pinRef.current
    const root = rootRef.current
    if (!pin || !root || !mode) return
    if (mode === 'v') {
      pin.style.position = ''
      pin.style.top = ''
      pin.style.height = ''
      pin.style.maxHeight = ''
      return
    }
    const cs = getComputedStyle(root)
    const top = parseFloat(cs.getPropertyValue('--paper-fold-sticky-top')) || 72
    const gap = parseFloat(cs.getPropertyValue('--paper-fold-sticky-gap')) || 24
    const scroller = scrollParent(root)
    const prop = (name: string) => {
      if (!scroller) return 0
      return parseFloat(scroller.style.getPropertyValue(name) || getComputedStyle(scroller).getPropertyValue(name)) || 0
    }
    const room = (scroller?.clientHeight || innerHeight) - top - prop('--scenery-clearance') - prop('--dock-clearance') - gap
    pin.style.position = 'sticky'
    pin.style.top = `${top}px`
    pin.style.height = `${Math.max(160, Math.round(room))}px`
    pin.style.maxHeight = '100%'
  }, [])

  const layout = useCallback(() => {
    const s = m.current
    const root = rootRef.current
    const flap = flapRef.current
    if (!root || !flap) return
    const was = s.mode
    const mode = detectFoldMode({
      width: innerWidth,
      height: innerHeight,
      coarse: mm('(pointer: coarse)'),
      segments: mm('(horizontal-viewport-segments: 2)'),
    })
    s.mode = mode
    root.dataset.foldMode = mode
    pinSheet(mode)

    let spread = 0
    const parent = root.parentElement
    if (parent) {
      const cs = getComputedStyle(parent)
      spread =
        parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    }
    if (!(spread > 0)) spread = innerWidth - 32
    const sizes = foldSizes(mode, spread, innerHeight)
    s.edge = sizes.edge

    if (mode === 'duo') {
      flap.style.height = ''
      s.W = sizes.above
      flap.style.width = `${s.W}px`
      root.style.setProperty('--paper-fold-half', `${sizes.current}px`)
      // Opening the phone opens the sheet; closing it folds the sheet away.
      if (was && was !== 'duo') {
        apply(s.p)
        go(1, { remember: false })
        return
      }
      // Mounting in Duo keeps what the reader left; with nothing remembered,
      // the book opens.
      if (!was && !hasStored(horizonRef.current)) {
        s.p = 1
        s.target = 1
      }
      apply(s.p)
      return
    }
    if (was === 'duo') {
      stop()
      s.p = 0
      s.v = 0
      s.target = 0
      s.landed = true
    }
    if (mode === 'v') {
      flap.style.width = ''
      // Faces are absolutely placed, so an auto-height flap collapses and the
      // scroll box reports its content's full height.
      flap.style.height = 'auto'
      const inner = scrollRef.current?.scrollHeight ?? 0
      s.H = Math.max(s.edge + 1, Math.min(inner + 2, sizes.maxAboveHeight))
      flap.style.height = `${s.H}px`
    } else {
      flap.style.height = ''
      s.W = sizes.above
      flap.style.width = `${s.W}px`
      root.style.setProperty('--paper-fold-cur', `${sizes.current}px`)
    }
    apply(s.p)
  }, [apply, go, stop, pinSheet])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (root) {
      const grain = paperGrain(getComputedStyle(root).getPropertyValue('--paper-fold-grain-alpha'))
      if (grain) root.style.setProperty('--paper-fold-grain', grain)
    }
    layout()
  }, [layout])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(t)
      t = setTimeout(layout, 80)
    }
    addEventListener('resize', onResize)
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      const parent = rootRef.current?.parentElement
      const aboveBody = aboveBodyRef.current
      // The parent grows with the spread every animation frame (in 'v' the slot's
      // height changes; in 'h' its width), so react only to what the layout reads:
      // the parent's width, and the sheet above's content height in 'v'. The parent
      // must not size itself to the fold (no shrink-to-fit), or the spread would
      // feed back into its own measure.
      ro = new ResizeObserver((entries) => {
        const s = m.current
        let changed = false
        for (const e of entries) {
          if (e.target === parent) {
            const w = e.contentRect.width
            if (!(Math.abs(w - s.parentW) < 0.5)) changed = true
            s.parentW = w
          } else if (e.target === aboveBody) {
            const h = e.contentRect.height
            if (!(Math.abs(h - s.aboveH) < 0.5) && s.mode === 'v') changed = true
            s.aboveH = h
          }
        }
        if (changed) layout()
      })
      if (parent) ro.observe(parent)
      if (aboveBody) ro.observe(aboveBody)
    }
    return () => {
      clearTimeout(t)
      removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [layout])

  // The pinned sheet's room changes with its scroller: the scroller resizing,
  // and the landscape writing its height (--scenery-clearance) onto the
  // scroller's style after it lays out, and again when the place changes.
  useEffect(() => {
    const root = rootRef.current
    const scroller = root && scrollParent(root)
    if (!scroller) return
    const repin = () => pinSheet(m.current.mode)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(repin) : null
    ro?.observe(scroller)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(repin) : null
    mo?.observe(scroller, { attributes: true, attributeFilter: ['style'] })
    return () => {
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [pinSheet])

  useEffect(() => stop, [stop])

  // F folds and unfolds, except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return
      if (stowedRef.current) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return
      const t = e.target
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      )
        return
      toggle()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [toggle])

  // ---------- drag ----------
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== undefined && e.button !== 0) return
    const s = m.current
    s.drag = {
      x: e.clientX,
      y: e.clientY,
      p0: s.p,
      moved: 0,
      lastPos: s.p,
      lastT: performance.now(),
      vel: 0,
      acc: 0,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is a nicety */
    }
    stop()
    s.v = 0
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = m.current
    const drag = s.drag
    if (!drag) return
    const vertical = s.mode === 'v'
    const span = Math.max(1, vertical ? s.H - s.edge : s.W - s.edge)
    const d = vertical ? (e.clientY - drag.y) / span : (drag.x - e.clientX) / span
    drag.moved = Math.max(drag.moved, Math.abs(vertical ? e.clientY - drag.y : e.clientX - drag.x))
    const np = Math.max(-0.05, Math.min(1.05, drag.p0 + d))
    const now = performance.now()
    const dt = Math.max(1, now - drag.lastT)
    drag.vel = ((np - drag.lastPos) / dt) * 1000
    drag.lastPos = np
    drag.lastT = now
    drag.acc += Math.abs(np - s.p)
    if (drag.acc > 0.05) {
      paperSound.crinkle(1 + Math.round(Math.random() * 2), 0.04, 0.8)
      drag.acc = 0
    }
    s.p = np
    apply(s.p)
  }

  const onPointerUp = () => {
    const s = m.current
    const drag = s.drag
    if (!drag) return
    s.drag = null
    s.tappedAt = performance.now()
    if (drag.moved < 4) {
      toggle()
      return
    }
    s.v = drag.vel
    go(releaseTarget(s.p, s.v), { fromDrag: true })
  }

  const onPointerCancel = () => {
    const s = m.current
    const drag = s.drag
    if (!drag) return
    s.drag = null
    if (drag.moved < 4) {
      // nothing moved: let it settle where it was headed, quietly
      go(s.target, { fromDrag: true, remember: false })
      return
    }
    s.v = drag.vel
    go(releaseTarget(s.p, s.v), { fromDrag: true })
  }

  // A click that follows a handled pointer gesture is ignored; a click with no
  // gesture (VoiceOver, Switch Control) toggles.
  const onClick = () => {
    if (performance.now() - m.current.tappedAt < 500) return
    toggle()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    onKeyDown,
  }

  const countPart = edgeCount === undefined ? '' : `, ${edgeCount} open`
  const edgeName = open ? `Fold ${edgeLabel} away` : `${edgeLabel}${countPart}. Unfold to read`

  return (
    <div
      ref={rootRef}
      className={['paper-fold', className].filter(Boolean).join(' ')}
      data-horizon={horizon}
      data-open={open ? 'true' : 'false'}
      data-stowed={stowed ? 'true' : undefined}
    >
      <div ref={slotRef} className="paper-fold-slot" hidden={stowed}>
        <div ref={pinRef} className="paper-fold-pin">
          <button
            type="button"
            className="paper-fold-edge"
            aria-expanded={open}
            aria-controls={frontId}
            aria-label={edgeName}
            {...handlers}
          >
            <svg
              className="paper-fold-chevron"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M10 3 5 8l5 5" />
            </svg>
            <span className="paper-fold-edge-label">{edgeLabel}</span>
            {edgeCount !== undefined && <span className="paper-fold-edge-count">{edgeCount}</span>}
          </button>
          <div ref={flapRef} className="paper-fold-flap">
            <section
              id={frontId}
              className="paper-fold-face paper-fold-front"
              aria-label={frontLabel ?? `${edgeLabel}, for reading`}
              inert={!open}
              aria-hidden={!open}
            >
              <div ref={scrollRef} className="paper-fold-scroll" style={{ overscrollBehavior: 'contain' }}>
                <div ref={aboveBodyRef} className="paper-fold-above">
                  {above}
                </div>
              </div>
            </section>
            <div className="paper-fold-face paper-fold-back" aria-hidden="true" />
            <button
              type="button"
              className="paper-fold-grip"
              aria-label="Fold the sheet away"
              aria-hidden={!open}
              tabIndex={open ? 0 : -1}
              {...handlers}
            />
          </div>
        </div>
      </div>
      <article className="paper-fold-current">{children}</article>
    </div>
  )
}
