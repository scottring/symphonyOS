import type { Member, Who } from './types.ts'

export interface MemberMatch { matched: Member[]; unmatched: string[] }

const norm = (s: string) => s.trim().toLowerCase()
const first = (s: string) => norm(s).split(/\s+/)[0] ?? ''

/**
 * Resolve the names an email uses to household members. "everyone" is the
 * children when the household has any (school mail addresses students), else
 * every member. Unmatched names are returned, never guessed onto someone.
 */
export function matchMembers(who: Who, members: Member[]): MemberMatch {
  if (who === 'everyone') {
    const kids = members.filter((m) => m.isChild)
    return { matched: kids.length ? kids : [...members], unmatched: [] }
  }
  const byFirst = new Map(members.map((m) => [first(m.name), m]))
  const seen = new Set<string>()
  const matched: Member[] = []
  const unmatched: string[] = []
  for (const name of who) {
    const m = byFirst.get(first(name))
    if (m) {
      if (!seen.has(m.id)) { seen.add(m.id); matched.push(m) }
    } else {
      unmatched.push(name)
    }
  }
  return { matched, unmatched }
}
