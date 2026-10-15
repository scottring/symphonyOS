// Structured side-channel for the conversational canvas.
//
// - toolOutcome: after a write tool runs, tell the client whether it saved and
//   which rows it touched, so the canvas can show saving → saved / didn't save
//   per operation and retry only what failed.
// - stableRowId: a deterministic row id for creations made in a turn. A turn
//   the client resends after a dropped connection carries the same turnId, so
//   the same creation maps to the same id and the second insert is recognised
//   (unique violation) instead of making a duplicate.
// - proposalItems: validate suggestions the model offers. They are shown as
//   proposals and never written here.

export const CANVAS_WRITE_TOOLS = new Set([
  'symphony_create_plan_item', 'symphony_link_plan_item', 'symphony_update_intention',
  'symphony_create_task', 'symphony_create_calendar_event', 'symphony_update_task',
  'symphony_complete_task', 'symphony_create_routine', 'symphony_update_routine',
  'symphony_create_note', 'symphony_set_meal',
  'symphony_create_contact', 'symphony_update_contact',
  'symphony_create_list', 'symphony_add_list_item', 'symphony_check_list_item', 'symphony_delete_list_item',
  'symphony_draft_email',
])

/** Creations that accept a deterministic id. */
export const IDEMPOTENT_CREATES = new Set([
  'symphony_create_plan_item', 'symphony_create_task', 'symphony_create_routine',
  'symphony_create_contact', 'symphony_create_note', 'symphony_create_list', 'symphony_add_list_item',
  'symphony_create_calendar_event',
])

export interface ToolOutcome { type: 'tool_result'; name: string; ok: boolean; ids?: string[]; error?: string }

export function toolOutcome(name: string, result: string, writes: ReadonlySet<string> = CANVAS_WRITE_TOOLS): ToolOutcome | null {
  if (!writes.has(name)) return null
  const text = (result ?? '').trim()
  if (/^error\b/i.test(text)) return { type: 'tool_result', name, ok: false, error: text.slice(0, 200) }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { parsed = null }
  const ids: string[] = []
  const collect = (v: unknown) => {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') ids.push((v as { id: string }).id)
  }
  if (Array.isArray(parsed)) parsed.forEach(collect)
  else if (parsed && typeof parsed === 'object') {
    if ((parsed as { error?: unknown }).error) return { type: 'tool_result', name, ok: false, error: String((parsed as { error: unknown }).error).slice(0, 200) }
    collect(parsed)
  }
  return { type: 'tool_result', name, ok: true, ...(ids.length ? { ids } : {}) }
}

/** A plain identity for "the same creation", independent of wording noise. */
export function creationKey(name: string, input: Record<string, unknown>): string {
  const norm = (v: unknown) => typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : v ?? ''
  return JSON.stringify([
    name,
    norm(input.title ?? input.name),
    norm(input.level),
    norm(input.period_start ?? input.scheduled_for),
    norm(input.parent_id ?? input.parent_task_id ?? input.parent_routine_id ?? input.list_id),
    // Lists, notes and events: their own identity fields.
    norm(input.text ?? (typeof input.content === 'string' ? input.content.slice(0, 120) : undefined) ?? input.start_time),
  ])
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID (v5 layout) from SHA-1 of user + turn + creation. Null without a valid turn id. */
export async function stableRowId(userId: string, turnId: unknown, name: string, input: Record<string, unknown>): Promise<string | null> {
  if (typeof turnId !== 'string' || !UUID_RE.test(turnId)) return null
  const bytes = new TextEncoder().encode(`symphony-canvas:${userId}:${turnId}:${creationKey(name, input)}`)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** `itemId` set: link that existing item under `parentId` rather than create one. */
export interface ProposalItem { key: string; title: string; level: 0 | 1 | 2 | 3; parentId?: string | null; itemId?: string; periodStart?: string; reason?: string }

const LEVELS: Record<string, 0 | 1 | 2 | 3> = { year: 0, season: 1, month: 2, week: 3 }

/** Sanitised suggestions, or an error to hand back to the model. */
export function proposalItems(input: Record<string, unknown>, keyPrefix: string): { items: ProposalItem[] } | { error: string } {
  const raw = Array.isArray(input.items) ? input.items : null
  if (!raw || !raw.length) return { error: 'Provide at least one suggested item' }
  // Links sort what already exists, so a whole month's unlinked list may go at once.
  const links = raw.every((r) => r && typeof r === 'object' && typeof (r as Record<string, unknown>).item_id === 'string')
  if (raw.length > (links ? 40 : 12)) return { error: links ? 'Suggest at most 40 links at a time' : 'Suggest at most 12 items at a time' }
  const items: ProposalItem[] = []
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return
    const o = r as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 300) : ''
    const level = LEVELS[String(o.level)]
    if (!title || level === undefined) return
    const periodStart = typeof o.period_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.period_start) ? o.period_start : undefined
    const itemId = typeof o.item_id === 'string' && UUID_RE.test(o.item_id) ? o.item_id : undefined
    const parentId = typeof o.parent_id === 'string' && UUID_RE.test(o.parent_id) ? o.parent_id : null
    // A link without a parent links nothing.
    if (o.item_id !== undefined && (!itemId || !parentId)) return
    items.push({
      key: `${keyPrefix}:${i}`, title, level,
      parentId,
      ...(itemId ? { itemId } : {}),
      ...(periodStart ? { periodStart } : {}),
      ...(typeof o.reason === 'string' && o.reason.trim() ? { reason: o.reason.trim().slice(0, 200) } : {}),
    })
  })
  if (!items.length) return { error: 'Each suggestion needs a title and a level (year, season, month or week)' }
  return { items }
}

export const PROPOSE_TOOL = {
  name: 'symphony_propose_plan_items',
  description: 'Show SUGGESTED planning items on the canvas without saving them. Use only for items you are suggesting that the person did not state themselves (for example "you might add a month goal for booking the venue"). They appear dashed with Keep / Leave out, and nothing is written until the person keeps them. When the person states their own items, create them directly with symphony_create_plan_item instead. Never invent goals the person has not expressed; suggestions must follow from what they said. To suggest that an EXISTING unlinked item belongs under an existing parent, pass item_id (that item) with parent_id and the item\'s own title and level; keeping it links the item, nothing new is created.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            level: { type: 'string', enum: ['year', 'season', 'month', 'week'] },
            parent_id: { type: 'string', description: 'Existing parent item id at the horizon above, if any' },
            item_id: { type: 'string', description: 'An existing item to link under parent_id instead of creating a new one' },
            period_start: { type: 'string', description: 'YYYY-MM-DD start of the period' },
            reason: { type: 'string', description: 'Short reason shown with the suggestion' },
          },
          required: ['title', 'level'],
        },
      },
    },
    required: ['items'],
  },
}
