// "Show me this page": the agent points at real things on the page the person
// is looking at while it explains (outline + short note + optional arrow).
// Ids must come from the page snapshot the client sent with this turn — its
// targets (regions on screen) and its items — so nothing else can be pointed
// at. It changes no data; the client draws it (src/components/explain).

export const SHOW_TOOL = {
  name: 'symphony_show_on_page',
  description: 'Point at real things on the page the person is looking at: outline them, with a short note beside them. One step answers a question ("where is…", "what is this"); 3 to 6 steps walk through the whole page when asked what the page is or how to use it. Changes no data. Available only with a workspace snapshot.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array', minItems: 1, maxItems: 6,
        items: {
          type: 'object',
          properties: {
            targets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3, description: 'Snapshot ids: a target id ("period", "loose", "region:Still to place") or a visible item id.' },
            title: { type: 'string', description: 'A few words, using the page\'s and the person\'s own names.' },
            text: { type: 'string', description: 'One to three short sentences: what this is and how to use it, with their real counts and titles.' },
            arrow: {
              type: 'object',
              description: 'Optional arrow between two snapshot ids, e.g. from a loose item to where it can be dragged.',
              properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string', description: 'One word, e.g. "drag".' }, drag: { type: 'boolean' } },
              required: ['from', 'to'],
            },
          },
          required: ['targets', 'title', 'text'],
        },
      },
    },
    required: ['steps'],
  },
}

export interface ShowStep { targets: string[]; title: string; text: string; arrow?: { from: string; to: string; label?: string; drag?: boolean } }

const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : ''

/** The ids this turn's snapshot lets the agent point at. */
export function pointableIds(snapshot: unknown): Set<string> {
  const ids = new Set<string>()
  if (!snapshot || typeof snapshot !== 'object') return ids
  const s = snapshot as { targets?: unknown; items?: unknown; intentions?: unknown }
  for (const list of [s.targets, s.items, s.intentions]) {
    if (!Array.isArray(list)) continue
    for (const x of list) if (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') ids.add((x as { id: string }).id)
  }
  return ids
}

/** Steps with only known ids; steps left with no target are dropped. */
export function showSteps(input: Record<string, unknown>, snapshot: unknown): { steps: ShowStep[] } | { error: string } {
  if (!snapshot) return { error: 'Pointing is only available while a Symphony page is open.' }
  const known = pointableIds(snapshot)
  const raw = Array.isArray(input.steps) ? input.steps.slice(0, 6) : []
  const steps: ShowStep[] = []
  const unknown: string[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const asked = (Array.isArray(o.targets) ? o.targets : []).map((t) => str(t, 120)).filter(Boolean)
    const targets = asked.filter((t) => known.has(t)).slice(0, 3)
    unknown.push(...asked.filter((t) => !known.has(t)))
    const title = str(o.title, 80), text = str(o.text, 500)
    if (!targets.length || (!title && !text)) continue
    const a = o.arrow && typeof o.arrow === 'object' ? o.arrow as Record<string, unknown> : null
    const from = a ? str(a.from, 120) : '', to = a ? str(a.to, 120) : '', label = a ? str(a.label, 16) : ''
    const arrow = from && to && known.has(from) && known.has(to) ? { from, to, ...(label ? { label } : {}), ...(a?.drag === true ? { drag: true } : {}) } : undefined
    steps.push({ targets, title, text, ...(arrow ? { arrow } : {}) })
  }
  if (!steps.length) return { error: `None of those ids are on the page${unknown.length ? ` (${unknown.slice(0, 3).join(', ')})` : ''}. Use the snapshot's target ids or visible item ids.` }
  return { steps }
}
