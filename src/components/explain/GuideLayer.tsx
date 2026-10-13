// src/components/explain/GuideLayer.tsx
//
// Draws what the conversation is showing: the page dims a little, each target
// gets an outline, a short note sits beside the first one with an arrow to
// it, and a step may add one arrow between two targets ("drag this onto
// that"). It follows scrolling and resizing, sits under the docked bar so the
// bar stays usable, and is hidden from screen readers except for the note.

import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { usePageGuide } from './GuideProvider'
import { findTarget } from '@/lib/explain/targets'
import { arrowBetween, inflate, placeNote, union, type Rect, type Side } from '@/lib/explain/geometry'
import './guide.css'

interface Layout { holes: Rect[]; arrows: { d: string; drag: boolean; label?: { x: number; y: number; text: string } }[]; note: Rect & { side: Side } }

const toRect = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }

/** The top of whatever sits at the window's foot: the docked bar, or the phone's dock. */
function floorOf(): number {
  const bar = document.querySelector('.canvas-strip.is-docked, .phone-dock')
  const top = bar?.getBoundingClientRect().top
  return top && top > 0 ? top : window.innerHeight
}

export function GuideLayer() {
  const guide = usePageGuide()
  const step = guide?.step ?? null
  const noteRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [tick, setTick] = useState(0)
  const maskId = useId().replace(/:/g, '')
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // A new step: bring its first target into view.
  useEffect(() => {
    if (!step) return
    const first = step.targets.map((id) => findTarget(id)).find(Boolean)
    if (!first) return
    const r = first.getBoundingClientRect()
    if (r.top < 80 || r.bottom > floorOf() - 24) first.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [step, reduced])

  // Follow the page: any scroll (inner scrollers too) or resize redraws.
  useEffect(() => {
    if (!step) return
    let raf = 0
    const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick((t) => t + 1) }) }
    window.addEventListener('scroll', redraw, { capture: true, passive: true })
    window.addEventListener('resize', redraw)
    const settle = window.setTimeout(redraw, 400)
    return () => { window.removeEventListener('scroll', redraw, { capture: true }); window.removeEventListener('resize', redraw); cancelAnimationFrame(raf); clearTimeout(settle) }
  }, [step])

  // A point (not a tour) clears when you go back to the page.
  const close = guide?.close
  const isPoint = (guide?.count ?? 0) === 1
  useEffect(() => {
    if (!step || !isPoint || !close) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t?.closest?.('.explain-note, .canvas-strip')) return
      close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [step, isPoint, close])

  useLayoutEffect(() => {
    if (!step) { setLayout(null); return }
    const rects = step.targets.map((id) => findTarget(id)).filter((el): el is HTMLElement => !!el).map(toRect)
    const view = { w: window.innerWidth, floor: floorOf() }
    const box = noteRef.current
    const size = { w: Math.min(320, view.w - 24), h: box?.offsetHeight ?? 120 }
    const holes = rects.map((r) => inflate(r, 6))
    // Nothing to point at (it scrolled away or folded): the note alone, at the foot.
    const note = rects.length ? placeNote(union(holes), size, view, 'right')
      : { x: Math.max(12, (view.w - size.w) / 2), y: Math.max(12, view.floor - size.h - 12), ...size, side: 'dock' as Side }
    const arrows: Layout['arrows'] = []
    const toFirst = holes[0] ? arrowBetween(note, holes[0]) : null
    if (toFirst) arrows.push({ d: toFirst.d, drag: false })
    if (step.arrow) {
      const from = findTarget(step.arrow.from), to = findTarget(step.arrow.to)
      const between = from && to ? arrowBetween(inflate(toRect(from), 4), inflate(toRect(to), 6)) : null
      if (between) arrows.push({ d: between.d, drag: !!step.arrow.drag, label: step.arrow.label ? { ...between.mid, text: step.arrow.label } : undefined })
    }
    const next: Layout = { holes, arrows, note }
    setLayout((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next)
  }, [step, tick])

  if (!guide || !step) return null
  // A tour's Back / Next and its count ride on the note itself, beside what it
  // points at — never in the bar at the foot (Scott, 2026-10-13).
  const controlsHere = guide.count > 1
  const last = guide.index === guide.count - 1

  return createPortal(<div className={`explain-layer${reduced ? ' is-still' : ''}`}>
    <svg className="explain-svg" aria-hidden="true" width="100%" height="100%">
      <defs>
        <mask id={`m${maskId}`}>
          <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
          {layout?.holes.map((h, i) => <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx="12" fill="#000" />)}
        </mask>
        <marker id={`a${maskId}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path className="explain-head" d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>
      <rect className="explain-scrim" x="0" y="0" width="100%" height="100%" mask={`url(#m${maskId})`} />
      {layout?.holes.map((h, i) => <g key={i}>
        <rect className="explain-halo" x={h.x} y={h.y} width={h.w} height={h.h} rx="12" />
        <rect className="explain-ring" x={h.x} y={h.y} width={h.w} height={h.h} rx="12" />
      </g>)}
      {layout?.arrows.map((a, i) => <g key={i}>
        <path className={`explain-arrow${a.drag ? ' is-drag' : ''}`} d={a.d} markerEnd={`url(#a${maskId})`} />
        {a.label && <>
          <rect className="explain-tag" x={a.label.x - 24} y={a.label.y - 11} width="48" height="22" rx="11" />
          <text className="explain-tag-text" x={a.label.x} y={a.label.y + 4} textAnchor="middle">{a.label.text}</text>
        </>}
      </g>)}
    </svg>
    <div ref={noteRef} className={`explain-note is-${layout?.note.side ?? 'dock'}`} role="status" aria-live="polite"
      style={{ left: layout?.note.x ?? 12, top: layout?.note.y ?? -9999, width: layout?.note.w, visibility: layout ? 'visible' : 'hidden' }}>
      <div className="explain-note-head">
        {step.title && <h2 className="explain-note-title">{step.title}</h2>}
        {controlsHere && <span className="explain-note-count">{guide.index + 1} of {guide.count}</span>}
        <button type="button" className="explain-note-close" aria-label="Close" onClick={guide.close}><X size={14} aria-hidden="true" /></button>
      </div>
      {step.text && <p className="explain-note-text">{step.text}</p>}
      {controlsHere && <div className="explain-note-controls">
        <button type="button" className="canvas-link" disabled={guide.index === 0} onClick={guide.back}>Back</button>
        <button type="button" className="explain-next" onClick={guide.next}>{last ? 'Done' : 'Next'}</button>
      </div>}
    </div>
  </div>, document.body)
}
