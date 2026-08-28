import type { Routine } from '@/types/actionable'

export type TendFinding =
  | { kind: 'lookalike'; ids: string[]; names: string[] }
  | { kind: 'missing-domain'; ids: string[] }
  | { kind: 'unfinished-name'; id: string; name: string }

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'of', 'with',
  'every', 'each', 'my', 'our', 'his', 'her', 'their', 'after', 'before', 'from',
  'day', 'week', 'weekly', 'daily', 'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
])

const DANGLING = new Set(['the', 'a', 'an', 'in', 'to', 'every', 'for', 'with', 'my', 'our', 'and', 'of'])

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}

/** Two tokens match when equal or one contains the other (plant ~ houseplant).
 * Substring containment requires BOTH tokens to be at least 4 chars to avoid false positives (am vs camp).
 */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.includes(b) || b.includes(a)
}

function sharedCount(a: string[], b: string[]): number {
  let n = 0
  const used = new Set<number>()
  for (const t of a) {
    const j = b.findIndex((u, i) => !used.has(i) && tokenMatch(t, u))
    if (j >= 0) {
      used.add(j)
      n += 1
    }
  }
  return n
}

export function findTend(routines: Routine[]): TendFinding[] {
  // Deliberately NOT resolveRoutine. Tend is a management surface: its job
  // is to show RESTING routines so you can wake them, which is the exact
  // opposite of rung 1. Filtering to `visibility === 'active'` here is the
  // seasonal shelf's own rule, not a stale copy of the visibility ladder.
  const eligible = routines.filter(r => !r.parent_routine_id && r.visibility === 'active')

  // Look-alikes: union-find over pairs sharing >=2 significant tokens.
  const toks = eligible.map(r => tokens(r.name))
  const parent = eligible.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      if (sharedCount(toks[i], toks[j]) >= 2) {
        parent[find(i)] = find(j)
      }
    }
  }
  const groups = new Map<number, number[]>()
  eligible.forEach((_, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), i])
  })

  const findings: TendFinding[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    findings.push({
      kind: 'lookalike',
      ids: members.map(i => eligible[i].id),
      names: members.map(i => eligible[i].name),
    })
  }

  const missing = eligible.filter(r => r.context == null)
  if (missing.length > 0) {
    findings.push({ kind: 'missing-domain', ids: missing.map(r => r.id) })
  }

  for (const r of eligible) {
    const words = r.name.trim().toLowerCase().split(/\s+/)
    const last = words[words.length - 1]
    if (words.length >= 2 && DANGLING.has(last)) {
      findings.push({ kind: 'unfinished-name', id: r.id, name: r.name })
    }
  }
  return findings
}

/** Stable identity for a finding — used for React keys and persisted dismissals. */
export function tendFindingKey(f: TendFinding): string {
  if (f.kind === 'lookalike') return `l:${[...f.ids].sort().join('.')}`
  if (f.kind === 'missing-domain') return 'missing-domain'
  return `u:${f.id}`
}
