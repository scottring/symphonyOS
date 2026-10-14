// src/lib/discussions/itemChip.ts
//
// The item panel's discussion button names the person and whose turn it is
// (discussions v2, mockup "Talking with Iris", board 1): before anything is
// said, "Talk to Iris about this"; once a discussion exists, "With Iris ·
// waiting on you" / "· waiting on Iris" / "· settled". Pure, so every panel
// says the same thing.

import type { InboxEntityType, InboxRow } from './inbox'
import { loginIds, memberOfAuth, namesLabel, type WaitingMember } from './waiting'

/** The item's discussion: the open one if there is one, else the newest. */
export function discussionFor(rows: readonly InboxRow[], entityType: InboxEntityType, entityId: string): InboxRow | undefined {
  const mine = rows.filter((r) => r.entityType === entityType && r.entityId === entityId)
  return mine.find((r) => r.state.kind !== 'settled') ?? mine[0]
}

/** The household's other logins, by name: who "Talk to … about this" means. */
export function otherLoginNames(members: readonly WaitingMember[], selfAuthId: string | null): string[] {
  return loginIds(members)
    .filter((id) => id !== selfAuthId)
    .map((id) => memberOfAuth(members, id)?.name)
    .filter((n): n is string => !!n)
}

export function discussionChipLabel(row: InboxRow | undefined, otherNames: readonly string[]): string {
  if (!row || row.state.kind === 'empty') {
    return otherNames.length ? `Talk to ${namesLabel(otherNames)} about this` : 'Discussion'
  }
  if (row.others.length === 0) return 'Discussion · just you'
  const withWhom = `With ${namesLabel(row.others)}`
  switch (row.state.kind) {
    case 'waiting-on-you': return `${withWhom} · waiting on you`
    case 'waiting-on-them': return row.state.names.length ? `${withWhom} · waiting on ${namesLabel(row.state.names)}` : withWhom
    case 'settled': return `${withWhom} · settled`
    default: return withWhom
  }
}
