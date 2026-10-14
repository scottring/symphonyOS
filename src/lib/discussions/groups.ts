// src/lib/discussions/groups.ts
//
// The Discussions page's groups, by whose turn it is (2026-10-14): Waiting on
// you, Waiting on Iris, Just you and Symphony, Settled this week.

import type { InboxRow } from './inbox'
import { namesLabel } from './waiting'

/** Settled discussions stay in view this long. */
const SETTLED_DAYS = 7

export interface DiscussionGroup { key: string; label: string; urgent?: boolean; rows: InboxRow[] }

export function groupDiscussions(rows: readonly InboxRow[], now = new Date()): DiscussionGroup[] {
  const since = now.getTime() - SETTLED_DAYS * 86_400_000
  const theirs = new Map<string, InboxRow[]>()
  const you: InboxRow[] = []
  const solo: InboxRow[] = []
  const settled: InboxRow[] = []
  for (const r of rows) {
    if (r.state.kind === 'settled') { if ((r.settledAt?.getTime() ?? 0) >= since) settled.push(r); continue }
    if (r.state.kind === 'waiting-on-you') you.push(r)
    else if (r.state.kind === 'waiting-on-them') {
      const k = namesLabel(r.state.names) || 'them'
      theirs.set(k, [...(theirs.get(k) ?? []), r])
    } else solo.push(r)
  }
  return [
    { key: 'you', label: 'Waiting on you', urgent: true, rows: you },
    ...[...theirs].map(([name, rs]) => ({ key: `on:${name}`, label: `Waiting on ${name}`, rows: rs })),
    { key: 'solo', label: 'Just you and Symphony', rows: solo },
    { key: 'settled', label: 'Settled this week', rows: settled },
  ].filter((g) => g.rows.length > 0)
}

