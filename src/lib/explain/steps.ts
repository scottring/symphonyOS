// src/lib/explain/steps.ts
//
// "Show me this page": what Symphony asks the page to show while it explains.
// A step outlines one to three real things on the page (a region the page
// labels, or an item by its id), with a short note, and at most one arrow
// between two of them ("drag this onto that"). The text agent and the voice
// both send the same shape; it changes no data.

export interface ShowArrow { from: string; to: string; label?: string; drag?: boolean }
export interface ShowStep { targets: string[]; title: string; text: string; arrow?: ShowArrow }

export const MAX_STEPS = 6
const MAX_TARGETS = 3

const str = (v: unknown, max: number): string => typeof v === 'string' ? v.trim().slice(0, max) : ''

/** Keep only well-formed steps; ids are checked against the page when shown. */
export function parseSteps(raw: unknown): ShowStep[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { steps?: unknown }).steps) ? (raw as { steps: unknown[] }).steps : []
  const out: ShowStep[] = []
  for (const s of list.slice(0, MAX_STEPS)) {
    if (!s || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    const targets = (Array.isArray(o.targets) ? o.targets : []).map((t) => str(t, 120)).filter(Boolean).slice(0, MAX_TARGETS)
    const title = str(o.title, 80), text = str(o.text, 500)
    if (!targets.length || (!title && !text)) continue
    const a = o.arrow && typeof o.arrow === 'object' ? o.arrow as Record<string, unknown> : null
    const from = a ? str(a.from, 120) : '', to = a ? str(a.to, 120) : ''
    const label = a ? str(a.label, 16) : ''
    out.push({ targets, title, text, ...(from && to ? { arrow: { from, to, ...(label ? { label } : {}), ...(a?.drag === true ? { drag: true } : {}) } } : {}) })
  }
  return out
}
