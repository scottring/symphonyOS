// Pure request logic for log-medication — no Deno/network deps, unit-tested.
export interface MedRow { id: string; name: string }

export type MatchResult =
  | { kind: 'all' }
  | { kind: 'one'; med: MedRow }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: MedRow[] }

export function matchMedication(query: string, meds: MedRow[]): MatchResult {
  const q = query.trim().toLowerCase()
  if (q === 'all') return { kind: 'all' }
  const hits = meds.filter((m) => m.name.toLowerCase().includes(q))
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length > 1) return { kind: 'ambiguous', candidates: hits }
  return { kind: 'one', med: hits[0] }
}

export type ParsedBody =
  | { ok: true; medication: string; taken_at?: string; note?: string }
  | { ok: false; error: string }

export function parseBody(raw: unknown): ParsedBody {
  const b = (raw ?? {}) as Record<string, unknown>
  if (typeof b.medication !== 'string' || b.medication.trim() === '') {
    return { ok: false, error: 'medication is required' }
  }
  if (b.taken_at !== undefined) {
    if (typeof b.taken_at !== 'string' || Number.isNaN(Date.parse(b.taken_at))) {
      return { ok: false, error: 'taken_at must be an ISO8601 string' }
    }
  }
  if (b.note !== undefined && typeof b.note !== 'string') {
    return { ok: false, error: 'note must be a string' }
  }
  return {
    ok: true,
    medication: b.medication,
    taken_at: b.taken_at as string | undefined,
    note: b.note as string | undefined,
  }
}
