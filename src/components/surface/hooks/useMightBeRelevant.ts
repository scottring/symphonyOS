import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { MightBeRelevantItem } from '../types'

export interface MightBeRelevantData {
  allTasks: Task[]
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'about', 'call', 'email', 'text', 'send', 'get', 'go', 'do', 'is', 'are',
  // Family-app noise: these words appear in half the tasks and prove nothing.
  'make', 'plan', 'new', 'set', 'buy', 'find', 'family', 'kids', 'together',
])

function tokenize(s: string | undefined): Set<string> {
  if (!s) return new Set()
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  )
}

function intersect<T>(a: Set<T>, b: Set<T>): T[] {
  const out: T[] = []
  for (const v of a) if (b.has(v)) out.push(v)
  return out
}

// Relevance = a REAL shared thread, strongest first: the same goal's cascade,
// the same project, the same contact, or overlapping content words. "Assigned
// to the same person" is deliberately NOT a signal — in a household of four it
// matches everything (couch cushions surfaced on "Wills signed"), and a wrong
// suggestion costs more trust than an empty section. No matches → no section.
export function useMightBeRelevant(target: Task, data: MightBeRelevantData): MightBeRelevantItem[] {
  return useMemo(() => {
    const out: MightBeRelevantItem[] = []
    const seen = new Set<string>([target.id])

    const targetTokens = new Set([...tokenize(target.title), ...tokenize(target.notes)])

    // 1) same goal thread — the cascade explicitly links them (goalId stamp or
    //    a copy-down lineage in either direction).
    for (const t of data.allTasks) {
      if (seen.has(t.id)) continue
      const sharedGoal = !!target.goalId && t.goalId === target.goalId
      const lineage = t.sourceId === target.id || target.sourceId === t.id
      if (sharedGoal || lineage) {
        out.push({ id: t.id, kind: 'task', title: t.title, completed: t.completed, reason: lineage ? 'same thread' : 'same goal' })
        seen.add(t.id)
      }
    }

    // 2) same project — they belong to the same body of work.
    if (target.projectId) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        if (t.projectId === target.projectId) {
          out.push({ id: t.id, kind: 'task', title: t.title, completed: t.completed, reason: 'same project' })
          seen.add(t.id)
        }
      }
    }

    // 3) same contact — both are explicitly ABOUT the same person (contactId,
    //    not assignee: "who it's about" carries meaning; "who does it" doesn't).
    if (target.contactId) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        if (t.contactId === target.contactId) {
          out.push({ id: t.id, kind: 'task', title: t.title, completed: t.completed, reason: 'same contact' })
          seen.add(t.id)
        }
      }
    }

    // 4) keyword overlap in title or notes — likely about the same thing.
    //    Ranked by overlap size so two shared words beat one.
    if (targetTokens.size > 0) {
      const keyword: Array<MightBeRelevantItem & { overlapCount: number }> = []
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        const candidateTokens = new Set([...tokenize(t.title), ...tokenize(t.notes)])
        const overlap = intersect(targetTokens, candidateTokens)
        if (overlap.length > 0) {
          keyword.push({
            id: t.id, kind: 'task', title: t.title, completed: t.completed,
            reason: `matches "${overlap[0]}"`,
            overlapCount: overlap.length,
          })
          seen.add(t.id)
        }
      }
      keyword.sort((a, b) => b.overlapCount - a.overlapCount)
      out.push(...keyword.map(({ overlapCount: _oc, ...item }) => item))
    }

    // Float open items above completed ones (stable within each group).
    const ordered = [
      ...out.filter((i) => !i.completed),
      ...out.filter((i) => i.completed),
    ]
    return ordered.slice(0, 3)
  }, [target, data])
}
