export type CandidateCategory = 'event' | 'activity' | 'task' | 'errand' | 'chore'

export interface CandidateItem {
  category: CandidateCategory
  title: string
  startTime?: string
  isAllDay?: boolean
  location?: string
  rsvp?: { needed: boolean; by?: string; to?: string; method?: string }
  giftsExpected?: string | null
  cost?: string | null
  forWho?: string
  confidence: number
}

export interface GapFlag {
  kind: 'unreadable_attachment' | 'truncated' | 'partial_thread' | 'low_confidence'
  note: string
}

export interface ExtractionResult {
  candidates: CandidateItem[]
  summary: string
  gaps: GapFlag[]
}

const CATEGORIES: CandidateCategory[] = ['event', 'activity', 'task', 'errand', 'chore']

export function buildExtractPrompt(body: string, sourceLabel: string): string {
  return `You extract family logistics from a noisy message thread or note.

SOURCE: ${sourceLabel}

CONTENT:
${body}

Pull out only the items a busy parent would need to act on: events, activities, tasks, errands, chores. For each, capture what you can find: title, start date-time (ISO 8601 local, omit if unknown), location, RSVP (needed/by/to/method), gifts expected, cost, and who it is for (a child's first name if mentioned). Give a confidence 0-1.

Then write a single-sentence summary of the remaining non-actionable "noise". If anything is unreadable or looks truncated, add a gap flag.

Respond with strict JSON only, no prose, no markdown fence:
{"candidates":[{"category":"event|activity|task|errand|chore","title":"...","startTime":"ISO|omit","isAllDay":false,"location":"...|omit","rsvp":{"needed":true,"by":"...","to":"...","method":"..."}|omit,"giftsExpected":"...|null","cost":"...|null","forWho":"...|omit","confidence":0.0}],"summary":"...","gaps":[{"kind":"unreadable_attachment|truncated|partial_thread|low_confidence","note":"..."}]}`
}

function isCandidate(v: unknown): v is CandidateItem {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.title === 'string' &&
    typeof o.category === 'string' &&
    (CATEGORIES as string[]).includes(o.category) &&
    typeof o.confidence === 'number'
  )
}

function isGap(v: unknown): v is GapFlag {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.kind === 'string' && typeof o.note === 'string'
}

const EMPTY: ExtractionResult = { candidates: [], summary: '', gaps: [] }

export function parseExtractResponse(raw: string): ExtractionResult {
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ...EMPTY }
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
  const o = parsed as Record<string, unknown>
  return {
    candidates: Array.isArray(o.candidates) ? o.candidates.filter(isCandidate) : [],
    summary: typeof o.summary === 'string' ? o.summary : '',
    gaps: Array.isArray(o.gaps) ? o.gaps.filter(isGap) : [],
  }
}
