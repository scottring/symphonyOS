import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { MightBeRelevantItem } from '../types'

export interface MightBeRelevantData {
  allTasks: Task[]
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
  'about', 'call', 'email', 'text', 'send', 'get', 'go', 'do', 'is', 'are',
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

export function useMightBeRelevant(target: Task, data: MightBeRelevantData): MightBeRelevantItem[] {
  return useMemo(() => {
    const out: MightBeRelevantItem[] = []
    const seen = new Set<string>([target.id])

    const targetTokens = new Set([...tokenize(target.title), ...tokenize(target.notes)])

    // 1) same contact — both are explicitly about the same person; the cleanest signal.
    if (target.contactId) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        if (t.contactId === target.contactId) {
          out.push({ id: t.id, kind: 'task', title: t.title, completed: t.completed, reason: 'same contact' })
          seen.add(t.id)
        }
      }
    }

    // 2) keyword overlap in title or notes — likely about the same thing. Ranked
    //    above same-assignee because content match is a far better relatedness
    //    signal than "happens to be assigned to the same person" (Scott's
    //    complaint was that the list surfaced unrelated tasks).
    if (targetTokens.size > 0) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        const candidateTokens = new Set([...tokenize(t.title), ...tokenize(t.notes)])
        const overlap = intersect(targetTokens, candidateTokens)
        if (overlap.length > 0) {
          out.push({
            id: t.id, kind: 'task', title: t.title, completed: t.completed,
            reason: `matches "${overlap[0]}"`,
          })
          seen.add(t.id)
        }
      }
    }

    // 3) same assignee / for-person — weakest signal (everything assigned to one
    //    person matches), so it's last AND limited to OPEN tasks to avoid noise.
    if (target.assignedTo) {
      for (const t of data.allTasks) {
        if (seen.has(t.id)) continue
        if (t.assignedTo === target.assignedTo && !t.completed) {
          out.push({ id: t.id, kind: 'task', title: t.title, completed: false, reason: 'same person' })
          seen.add(t.id)
        }
      }
    }

    // Float open items above completed ones (stable within each group).
    const ordered = [
      ...out.filter((i) => !i.completed),
      ...out.filter((i) => i.completed),
    ]
    return ordered.slice(0, 3)
  }, [target, data])
}
