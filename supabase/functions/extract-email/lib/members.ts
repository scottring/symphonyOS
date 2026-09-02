import type { Member, Who } from './types.ts'

export interface MemberMatch { matched: Member[]; unmatched: string[] }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const first = (s: string) => norm(s).split(' ')[0] ?? ''

/**
 * Resolve the names an email uses to household members. "everyone" is the
 * children when the household has any (school mail addresses students), else
 * every member. Unmatched names are returned, never guessed onto someone.
 *
 * A first name shared by two or more members is ambiguous and matches
 * nobody by itself — a bare "Sam" must never be silently pinned to
 * whichever "Sam" happened to be registered first. A multi-word query that
 * exactly matches a member's full name still resolves that member, even
 * when their first name alone is ambiguous.
 */
export function matchMembers(who: Who, members: Member[]): MemberMatch {
  if (who === 'everyone') {
    const kids = members.filter((m) => m.isChild)
    return { matched: kids.length ? kids : [...members], unmatched: [] }
  }

  const byFullName = new Map(members.map((m) => [norm(m.name), m]))
  const byFirstName = new Map<string, Member[]>()
  for (const m of members) {
    const f = first(m.name)
    const bucket = byFirstName.get(f)
    if (bucket) bucket.push(m)
    else byFirstName.set(f, [m])
  }

  const resolve = (name: string): Member | null => {
    const n = norm(name)
    if (n.includes(' ')) {
      const full = byFullName.get(n)
      if (full) return full
    }
    const candidates = byFirstName.get(first(name)) ?? []
    return candidates.length === 1 ? candidates[0] : null
  }

  const seen = new Set<string>()
  const matched: Member[] = []
  const unmatched: string[] = []
  for (const name of who) {
    const m = resolve(name)
    if (m) {
      if (!seen.has(m.id)) { seen.add(m.id); matched.push(m) }
    } else {
      unmatched.push(name)
    }
  }
  return { matched, unmatched }
}
