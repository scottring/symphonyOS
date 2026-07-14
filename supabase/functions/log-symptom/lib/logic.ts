// Pure request/utterance logic for log-symptom — no Deno/network deps, unit-tested.
export interface SymptomRow { id: string; name: string }
export type Severity = 1 | 2 | 3

export type ParsedBody =
  | { ok: true; utterance: string; logged_at?: string }
  | { ok: false; error: string }

export function parseBody(raw: unknown): ParsedBody {
  const b = (raw ?? {}) as Record<string, unknown>
  if (typeof b.utterance !== 'string' || b.utterance.trim() === '') {
    return { ok: false, error: 'utterance is required' }
  }
  if (b.logged_at !== undefined) {
    if (typeof b.logged_at !== 'string' || Number.isNaN(Date.parse(b.logged_at))) {
      return { ok: false, error: 'logged_at must be an ISO8601 string' }
    }
  }
  return { ok: true, utterance: b.utterance, logged_at: b.logged_at as string | undefined }
}

const WORD_TO_SEVERITY: Record<string, Severity> = {
  mild: 1, light: 1, slight: 1,
  moderate: 2, medium: 2,
  severe: 3, bad: 3, intense: 3, strong: 3,
}
const SEVERITY_RE = /\b(mild|light|slight|moderate|medium|severe|bad|intense|strong)\b/i

export interface ParsedUtterance {
  severity: Severity
  matches: SymptomRow[]
  note: string | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Leftover text after stripping severity + symptom names → note (or null).
function tidyNote(s: string): string | null {
  let t = s.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.replace(/^(and|with)\s+/i, '').replace(/\s+(and|with)$/i, '').trim()
  if (/^(and|with)$/i.test(t)) t = ''
  return t.length > 0 ? t : null
}

export function parseUtterance(utterance: string, symptoms: SymptomRow[]): ParsedUtterance {
  let text = utterance
  let severity: Severity = 2
  const m = SEVERITY_RE.exec(text)
  if (m) {
    severity = WORD_TO_SEVERITY[m[1].toLowerCase()]
    text = text.slice(0, m.index) + text.slice(m.index + m[1].length)
  }

  let matches = symptoms.filter((s) => text.toLowerCase().includes(s.name.toLowerCase()))
  // Overlap rule: a match whose name is contained in a longer match's name is dropped.
  matches = matches.filter((a) => !matches.some((b) =>
    b.name.length > a.name.length && b.name.toLowerCase().includes(a.name.toLowerCase())))

  if (matches.length === 0) return { severity, matches: [], note: null }

  for (const s of matches) {
    text = text.replace(new RegExp(escapeRegExp(s.name), 'i'), '')
  }
  return { severity, matches, note: tidyNote(text) }
}

const SEVERITY_SPOKEN: Record<Severity, string> = { 1: 'mild', 2: 'moderate', 3: 'severe' }

export function buildMessage(names: string[], severity: Severity, timeStr: string): string {
  const joined = names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Logged ${joined}, ${SEVERITY_SPOKEN[severity]}, at ${timeStr}`
}
