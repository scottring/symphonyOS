import { describe, it, expect } from 'vitest'
import { runPrepass, normalizeTitle, titleSimilarity, MAX_PUT_ASIDE } from './prepass'
import type { Task } from '@/types/task'

const NOW = new Date(2026, 6, 22) // Jul 22 2026, local

function task(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    completed: false,
    createdAt: new Date(2026, 6, 20),
    updatedAt: new Date(2026, 6, 20),
    ...overrides,
  } as Task
}

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation and extra whitespace', () => {
    expect(normalizeTitle('  Weed the  backyard!! ')).toBe('weed the backyard')
  })
})

describe('titleSimilarity', () => {
  it('is 1 for identical strings and low for unrelated ones', () => {
    expect(titleSimilarity('weed the backyard', 'weed the backyard')).toBe(1)
    expect(titleSimilarity('weed the backyard', 'ask for ynab refund')).toBeLessThan(0.3)
  })
})

describe('runPrepass', () => {
  it('proposes a merge for duplicate titles, keeping the older task', () => {
    const older = task({ id: 'a', title: 'Invite Guy + Jess over for pizza', createdAt: new Date(2026, 6, 8) })
    const newer = task({ id: 'b', title: 'Invite Guy + Jess over for pizza', createdAt: new Date(2026, 6, 15) })
    const proposals = runPrepass([older, newer], [], NOW)
    const merge = proposals.find((p) => p.kind === 'merge')
    expect(merge).toMatchObject({ kind: 'merge', keepId: 'a', dropIds: ['b'] })
  })

  it('catches near-duplicates across pool and carry-over', () => {
    const a = task({ id: 'a', title: 'Install Symphony for Mac for Iris', createdAt: new Date(2026, 6, 1) })
    const b = task({ id: 'b', title: 'Install symphony for mac for iris!', createdAt: new Date(2026, 6, 10) })
    const proposals = runPrepass([a], [b], NOW)
    expect(proposals.filter((p) => p.kind === 'merge')).toHaveLength(1)
  })

  it('proposes put_aside for tasks unfinished ≥21 days', () => {
    const stale = task({ id: 's', title: 'Ask for YNAB refund', createdAt: new Date(2026, 5, 20) }) // 32 days
    const fresh = task({ id: 'f', title: 'Get plants for the entryway', createdAt: new Date(2026, 6, 20) })
    const proposals = runPrepass([stale, fresh], [], NOW)
    expect(proposals).toEqual([
      expect.objectContaining({ kind: 'put_aside', taskId: 's' }),
    ])
  })

  it('does not double-report a task that is both stale and a merge drop', () => {
    const keep = task({ id: 'a', title: 'Ask for YNAB refund', createdAt: new Date(2026, 5, 1) })
    const drop = task({ id: 'b', title: 'Ask for YNAB refund', createdAt: new Date(2026, 5, 20) })
    const proposals = runPrepass([keep, drop], [], NOW)
    // drop 'b' is consumed by the merge; only 'a' may additionally be stale
    const staleIds = proposals.filter((p) => p.kind === 'put_aside').map((p) => p.taskId)
    expect(staleIds).not.toContain('b')
  })

  it('caps put_aside at MAX_PUT_ASIDE and keeps the oldest, so a long-standing list does not bury the judgment cards', () => {
    // A real week list is mostly months old — without a cap every one of these
    // becomes an identical "sitting unfinished" card and the merge/place cards
    // that carry actual judgment scroll off the shelf.
    // Titles must be mutually dissimilar or the dedup pass consumes them.
    const TITLES = [
      'Ask for YNAB refund', 'Weed the backyard', 'Book the dentist', 'Replace furnace filter',
      'Call about the roof', 'Renew passport photos', 'Sort the garage shelves', 'Email the accountant',
      'Fix the porch light',
    ]
    const many = TITLES.slice(0, MAX_PUT_ASIDE + 4).map((title, i) =>
      task({ id: `s${i}`, title, createdAt: new Date(2026, 5, 20 - i) }),
    )
    const proposals = runPrepass(many, [], NOW)
    const aside = proposals.filter((p) => p.kind === 'put_aside')
    expect(aside).toHaveLength(MAX_PUT_ASIDE)
    // Oldest first: s{n-1} is the oldest (created earliest).
    expect(aside[0].taskId).toBe(`s${MAX_PUT_ASIDE + 3}`)
  })

  it('ignores completed tasks and same-id overlap between pool and carryOver', () => {
    const done = task({ id: 'd', title: 'Weed the backyard', completed: true, createdAt: new Date(2026, 5, 1) })
    const dup = task({ id: 'x', title: 'Weed the backyard', createdAt: new Date(2026, 5, 1) })
    const proposals = runPrepass([done, dup], [dup], NOW)
    expect(proposals.filter((p) => p.kind === 'merge')).toHaveLength(0)
  })
})
