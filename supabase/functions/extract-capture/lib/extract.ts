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
  /** Who posted the message this came from — the teacher, or the parent in a
   * group thread. A school feed has many voices and "who is asking" changes
   * how a request reads. */
  from?: string
  confidence: number
}

export interface GapFlag {
  kind: 'unreadable_attachment' | 'truncated' | 'partial_thread' | 'low_confidence'
  note: string
}

export interface ExtractionResult {
  candidates: CandidateItem[]
  summary: string
  /** Things a parent must KNOW but cannot DO — attendance rules, dismissal
   * procedure, a curriculum change. Deliberately not candidates: a policy has
   * no date and nothing to check off, and as a task it is a row you can only
   * dismiss. They belong in the capture note, named, rather than compressed
   * into the one-sentence noise summary where they used to disappear. */
  announcements: string[]
  gaps: GapFlag[]
}

const CATEGORIES: CandidateCategory[] = ['event', 'activity', 'task', 'errand', 'chore']

export function buildExtractPrompt(body: string, sourceLabel: string): string {
  return `You extract family logistics from a noisy message thread or note.

SOURCE: ${sourceLabel}

CONTENT:
${body}

Pull out only the items a busy parent would need to act on: events, activities, tasks, errands, chores. For each, capture what you can find: title, start date-time (ISO 8601 local, omit if unknown), location, RSVP (needed/by/to/method), gifts expected, cost, who it is for (a child's first name if mentioned), and who posted it ("from" — the teacher or parent whose name precedes the message). Give a confidence 0-1.

An item is only a candidate if there is something to DO. A standing rule or procedure is not a candidate.

Then list "announcements": things a parent must KNOW but cannot act on — attendance and lateness rules, dismissal procedure, curriculum or schedule changes, policy statements. One short sentence each, in the thread's own terms. These are NOT candidates and must not be repeated as candidates.

Then write a single-sentence summary of what is left: genuine chatter (greetings, photos, videos, encouragement). If anything is unreadable or looks truncated, add a gap flag.

Respond with strict JSON only, no prose, no markdown fence:
{"candidates":[{"category":"event|activity|task|errand|chore","title":"...","startTime":"ISO|omit","isAllDay":false,"location":"...|omit","rsvp":{"needed":true,"by":"...","to":"...","method":"..."}|omit,"giftsExpected":"...|null","cost":"...|null","forWho":"...|omit","from":"...|omit","confidence":0.0}],"summary":"...","announcements":["..."],"gaps":[{"kind":"unreadable_attachment|truncated|partial_thread|low_confidence","note":"..."}]}`
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

const EMPTY: ExtractionResult = { candidates: [], summary: '', announcements: [], gaps: [] }

export function parseExtractResponse(raw: string): ExtractionResult {
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Fallback: extract the substring between the first '{' and the last '}'
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first !== -1 && last > first) {
      try {
        parsed = JSON.parse(trimmed.slice(first, last + 1))
      } catch {
        return { ...EMPTY }
      }
    } else {
      return { ...EMPTY }
    }
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
  const o = parsed as Record<string, unknown>
  return {
    candidates: Array.isArray(o.candidates) ? o.candidates.filter(isCandidate) : [],
    summary: typeof o.summary === 'string' ? o.summary : '',
    announcements: Array.isArray(o.announcements)
      ? o.announcements.filter((a): a is string => typeof a === 'string')
      : [],
    gaps: Array.isArray(o.gaps) ? o.gaps.filter(isGap) : [],
  }
}
