// src/lib/explain/targets.ts
//
// What on the page Symphony may point at, read from the page itself when a
// turn is sent, so the list is always what is really on screen:
//
// - regions: anything a page marks with data-explain="id" (label from
//   data-explain-label or aria-label), and every labelled section, group or
//   list (aria-label) — "Still to place", "Under Feel stronger" — named
//   "region:<label>";
// - items: rows and cards by the task or goal id the page snapshot lists.
//
// Nothing else can be targeted; the conversation bar and the guide itself
// are never part of the page.

export interface ExplainTarget { id: string; label: string }

const REGION_SEL = '[data-explain], section[aria-label], section[aria-labelledby], aside[aria-label], aside[aria-labelledby], ul[aria-label], [role="group"][aria-label], [role="region"][aria-label]'
const OUTSIDE = '.canvas-strip, .explain-layer, dialog, [role="dialog"], [role="menu"], [data-explain-ignore]'
const ITEM_ATTRS = ['data-explain-item', 'data-plan-key', 'data-group-key', 'data-task-id'] as const
const SAFE_ID = /^[\w:.-]{1,120}$/
const MAX_TARGETS = 40

function shown(el: Element): boolean {
  if (el.closest(OUTSIDE)) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** Its accessible name: aria-label, or the text of what aria-labelledby names. */
function nameOf(el: Element): string {
  const label = el.getAttribute('aria-label')
  if (label) return label.trim().replace(/\s+/g, ' ')
  const ids = el.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? []
  return ids.map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ').trim().replace(/\s+/g, ' ')
}

function regionId(el: Element): string | null {
  const own = el.getAttribute('data-explain')
  if (own) return SAFE_ID.test(own) ? own : null
  const name = nameOf(el)
  return name ? `region:${name.slice(0, 80)}` : null
}

function regionLabel(el: Element): string {
  return (el.getAttribute('data-explain-label') ?? (nameOf(el) || el.textContent) ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
}

/** The page itself: the shell's content frame, not its chrome. */
const pageRoot = (): ParentNode => document.querySelector('[data-explain-root]') ?? document

/** The regions on screen now, for the page snapshot sent with a turn. */
export function collectTargets(root: ParentNode = pageRoot()): ExplainTarget[] {
  const seen = new Set<string>(), labels = new Set<string>()
  const out: ExplainTarget[] = []
  for (const el of Array.from(root.querySelectorAll(REGION_SEL))) {
    const id = regionId(el)
    if (!id || seen.has(id) || !shown(el)) continue
    const label = regionLabel(el)
    // A part the page names explicitly hides a list of the same name inside it.
    if (labels.has(label.toLowerCase())) continue
    seen.add(id); labels.add(label.toLowerCase())
    out.push({ id, label })
    if (out.length >= MAX_TARGETS) break
  }
  return out
}

/** The element a target id names, if it is on screen. Items: a plan row or
 * card ends its key with the id (`1:<id>`). */
export function findTarget(id: string, root: ParentNode = pageRoot()): HTMLElement | null {
  if (id.startsWith('region:')) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(REGION_SEL))) {
      if (regionId(el) === id && shown(el)) return el
    }
    return null
  }
  if (!SAFE_ID.test(id)) return null
  for (const attr of ['data-explain', ...ITEM_ATTRS]) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${attr}]`))) {
      const v = el.getAttribute(attr) ?? ''
      const match = attr === 'data-plan-key' || attr === 'data-group-key' ? v === id || v.endsWith(`:${id}`) : v === id
      if (match && shown(el)) return el
    }
  }
  return null
}
