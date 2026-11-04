// Scott, 2026-11-04: paper-style horizons. The motion of one companion sheet
// on its hinge: the spring, the drag, the keyboard and the paper sounds,
// shared by the sheet above (left edge, key F) and this period's calendar
// (right edge, key C, Task 5c). Ported from the approved prototype's
// makeFold(side), docs/superpowers/specs/2026-11-04-paper-fold-prototype.html.
//
// The fold position p (0 folded, 1 open) changes every frame, so it lives in
// a ref and is written straight to the DOM (--p, the slot size, the flap's
// rotation). React re-renders only when the sheet crosses halfway (`open`,
// for aria, inert and data-open). PaperFold owns the layout (mode, sizes) and
// writes W, H and edge into `m` before it applies.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { springSettled, springStep, releaseTarget } from '@/lib/fold/foldSpring'
import type { FoldMode } from '@/lib/fold/foldMode'
import { paperSound } from '@/lib/fold/paperSound'

/** Which edge the companion is hinged to: the sheet above on the left (the
 *  top on phones), the calendar on the right (the bottom on phones). */
export type FoldSide = 'above' | 'calendar'

export function readStored(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'open'
  } catch {
    return false
  }
}

/** Has the reader ever opened or folded this companion here? */
export function hasStored(key: string): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === 'open' || v === 'folded'
  } catch {
    return false
  }
}

export function writeStored(key: string, open: boolean) {
  try {
    localStorage.setItem(key, open ? 'open' : 'folded')
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

export const reducedMotion = () => mm('(prefers-reduced-motion: reduce)')

function buzz() {
  try {
    navigator.vibrate?.(6)
  } catch {
    /* no haptics */
  }
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
  /** This drag has already folded the other companion away. */
  cleared: boolean
}

export interface FoldMotionState {
  p: number
  v: number
  target: 0 | 1
  raf: number
  landed: boolean
  last: number
  /** Open width beside the page ('h', 'duo'), open height on a phone ('v'), the folded edge. */
  W: number
  H: number
  edge: number
  open: boolean
  drag: Drag | null
  tappedAt: number
}

export interface GoOptions {
  /** A released drag: no swish (the drag made its own sound). */
  fromDrag?: boolean
  /** False when the page or the layout (not the reader) moved it. */
  remember?: boolean
  /** Folded away by the other companion: no swish, and no landing in reduced motion. */
  quiet?: boolean
}

export interface FoldHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onClick: () => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void
}

export interface FoldMotion {
  open: boolean
  m: MutableRefObject<FoldMotionState>
  apply: (x: number) => void
  go: (to: 0 | 1, opts?: GoOptions) => void
  toggle: () => void
  stop: () => void
  /** The layout's writes into the motion state (sizes; a jump with no motion). */
  patch: (p: Partial<Pick<FoldMotionState, 'p' | 'v' | 'target' | 'landed' | 'W' | 'H' | 'edge'>>) => void
  handlers: FoldHandlers
}

/** Focus where a letter key is not the page's: a field, editable text, or
 *  anything inside a menu or a dialog. */
function keyBelongsElsewhere(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true
  if (t.isContentEditable) return true
  return !!t.closest('[role="dialog"], [role="menu"], dialog, [contenteditable=""], [contenteditable="true"]')
}

export function useFoldMotion({
  side,
  storageKey,
  initialOpen,
  mode,
  rootRef,
  slotRef,
  flapRef,
  keyName,
  keyEnabled,
  onOpen,
}: {
  side: FoldSide
  /** localStorage key for the remembered state. */
  storageKey: string
  initialOpen: boolean
  /** The layout's current mode (PaperFold's). */
  mode: MutableRefObject<FoldMode | ''>
  rootRef: RefObject<HTMLElement | null>
  slotRef: RefObject<HTMLElement | null>
  flapRef: RefObject<HTMLElement | null>
  /** The key that folds and unfolds it ('f', 'c'), except while typing. */
  keyName: string
  /** Whether the key and the companion are live (not stowed, present). */
  keyEnabled: () => boolean
  /** It is about to open: the other companion folds when the spread has no room for both. */
  onOpen?: (o: { remember: boolean }) => void
}): FoldMotion {
  const [open, setOpen] = useState(initialOpen)
  const initial = initialOpen ? 1 : 0
  const m = useRef<FoldMotionState>({
    p: initial,
    v: 0,
    target: initial as 0 | 1,
    raf: 0,
    landed: true,
    last: 0,
    W: 340,
    H: 300,
    edge: 34,
    open: initialOpen,
    drag: null,
    tappedAt: -Infinity,
  })
  const keyRef = useRef(storageKey)
  const enabledRef = useRef(keyEnabled)
  const onOpenRef = useRef(onOpen)
  useLayoutEffect(() => {
    keyRef.current = storageKey
    enabledRef.current = keyEnabled
    onOpenRef.current = onOpen
  })

  const apply = useCallback(
    (x: number) => {
      const s = m.current
      const root = rootRef.current
      const slot = slotRef.current
      const flap = flapRef.current
      if (!root || !slot || !flap) return
      const q = Math.max(-0.04, Math.min(1.04, x))
      if (side === 'above') {
        root.style.setProperty('--p', q.toFixed(4))
      } else {
        // The calendar's own --p for what is inside its slot, and --pc on the
        // root for the crease it casts on this sheet's right edge.
        slot.style.setProperty('--p', q.toFixed(4))
        root.style.setProperty('--pc', Math.max(0, q).toFixed(4))
      }
      const ang = (1 - q) * 180
      // Mirrored: the sheet above turns from the left (top), the calendar from the right (bottom).
      const sign = side === 'above' ? 1 : -1
      if (mode.current === 'v') {
        slot.style.width = ''
        slot.style.height = `${s.edge + Math.max(0, q) * (s.H - s.edge)}px`
        flap.style.transform = `rotateX(${(sign * ang).toFixed(2)}deg)`
      } else {
        slot.style.height = ''
        slot.style.width = `${s.edge + Math.max(0, q) * (s.W - s.edge)}px`
        flap.style.transform = `rotateY(${(-sign * ang).toFixed(2)}deg)`
      }
      flap.style.visibility = q < 0.002 ? 'hidden' : 'visible'
      const isOpen = q > 0.5
      if (isOpen !== s.open) {
        s.open = isOpen
        setOpen(isOpen)
      }
    },
    [side, mode, rootRef, slotRef, flapRef],
  )

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

  /** Send the sheet toward `to`. */
  const go = useCallback(
    (to: 0 | 1, opts: GoOptions = {}) => {
      const s = m.current
      const remember = opts.remember !== false
      if (remember) writeStored(keyRef.current, to === 1)
      // Already there and at rest: nothing moves, nothing sounds.
      if (to === s.target && !s.raf && s.p === to) return
      if (to === 1) onOpenRef.current?.({ remember })
      s.target = to
      s.landed = false
      if (reducedMotion()) {
        stop()
        s.p = to
        s.v = 0
        apply(s.p)
        if (!opts.quiet) paperSound.land(0.6)
        s.landed = true
        return
      }
      if (!opts.fromDrag && !opts.quiet) {
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

  const patch = useCallback<FoldMotion['patch']>((p) => {
    Object.assign(m.current, p)
  }, [])

  useEffect(() => stop, [stop])

  // The key folds and unfolds it, except while typing or inside a menu or a
  // dialog (its letters are the menu's, not the page's).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typeof e.key !== 'string' || e.key.toLowerCase() !== keyName) return
      if (!enabledRef.current()) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return
      if (keyBelongsElsewhere(e.target)) return
      toggle()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [toggle, keyName])

  // ---------- drag ----------
  const handlers = useMemo<FoldHandlers>(() => {
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
        cleared: false,
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
      const vertical = mode.current === 'v'
      const span = Math.max(1, vertical ? s.H - s.edge : s.W - s.edge)
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      // The sheet above opens leftward (downward on a phone); the calendar,
      // its mirror, rightward (upward).
      const d = vertical ? (side === 'above' ? dy : -dy) / span : (side === 'above' ? -dx : dx) / span
      drag.moved = Math.max(drag.moved, Math.abs(vertical ? dy : dx))
      const np = Math.max(-0.05, Math.min(1.05, drag.p0 + d))
      // Pulled open past a sliver: the other companion makes room now.
      if (np > 0.05 && s.target === 0 && !drag.cleared) {
        drag.cleared = true
        onOpenRef.current?.({ remember: true })
      }
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

    // A click that follows a handled pointer gesture is ignored; a click with
    // no gesture (VoiceOver, Switch Control) toggles.
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

    return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, onKeyDown }
  }, [side, mode, apply, go, stop, toggle])

  return { open, m, apply, go, toggle, stop, patch, handlers }
}
