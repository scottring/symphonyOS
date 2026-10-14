// src/lib/discussions/waiting.ts
//
// Who a discussion is WITH, and whose turn it is (Scott, 2026-10-14: "it's not
// at all clear who I'm chatting with", and nothing said a discussion was
// waiting). Pure, so the Discussions page, the top-bar count, the drawer and
// the wall all agree.
//
// - The people: the thread's owner plus `with_user_ids`. A thread from before
//   anyone could be chosen counts as with the household's other logins when
//   it is shared and a person has posted to the people (not only asked
//   Symphony); otherwise it is just its owner, thinking it through.
// - Waiting: the last word decides. A person's message waits on everyone else
//   in it; Symphony's answer, or a question to Symphony, waits on whoever
//   asked. A settled discussion waits on no one.

import type { Scope } from '@/lib/scope'

export interface WaitingMember {
  id: string
  name: string
  auth_user_id?: string | null
  user_id?: string | null
  is_full_user?: boolean
}

export interface WaitingMessage {
  role?: string
  content?: string
  timestamp?: string | Date
  askedSymphony?: boolean
  author?: { id?: string | null; name?: string; kind?: string }
}

export interface WaitingSession {
  user_id: string
  scope?: string | null
  with_user_ids?: string[] | null
  settled_at?: string | null
  messages: unknown
}

export type DiscussionState =
  | { kind: 'settled' }
  | { kind: 'waiting-on-you' }
  | { kind: 'waiting-on-them'; names: string[] }
  | { kind: 'just-you' }
  | { kind: 'empty' }

/** The person a login belongs to: their own member row, else the household
 *  creator's seed row (no auth_user_id, user_id = their auth id). */
export function memberOfAuth<T extends WaitingMember>(members: readonly T[], authId: string | null | undefined): T | undefined {
  if (!authId) return undefined
  return members.find((m) => m.auth_user_id === authId)
    ?? members.find((m) => !m.auth_user_id && m.user_id === authId && m.is_full_user !== false)
}

/** Every login in the household, as auth ids. */
export function loginIds(members: readonly WaitingMember[]): string[] {
  const ids = new Set<string>()
  for (const m of members) {
    if (m.auth_user_id) ids.add(m.auth_user_id)
    else if (m.is_full_user && m.user_id) ids.add(m.user_id)
  }
  return [...ids]
}

function readMessages(raw: unknown): WaitingMessage[] {
  return (Array.isArray(raw) ? (raw as WaitingMessage[]) : []).filter((m) => (m.content ?? '').trim().length > 0)
}

const isSymphony = (m: WaitingMessage) => m.role === 'assistant' || m.author?.kind === 'symphony'

/** The auth ids of everyone in the discussion, owner first. */
export function discussionPeople(s: WaitingSession, members: readonly WaitingMember[]): string[] {
  const chosen = (s.with_user_ids ?? []).filter((id) => id !== s.user_id)
  if (chosen.length > 0) return [s.user_id, ...chosen]
  const shared = s.scope === 'couple' || s.scope === 'compound'
  const toPeople = readMessages(s.messages).some((m) => !isSymphony(m) && !m.askedSymphony)
  if (shared && toPeople) return [s.user_id, ...loginIds(members).filter((id) => id !== s.user_id)]
  return [s.user_id]
}

/** The names of the others in it, as the viewer sees them. */
export function othersIn(s: WaitingSession, members: readonly WaitingMember[], selfAuthId: string | null): string[] {
  return discussionPeople(s, members)
    .filter((id) => id !== selfAuthId)
    .map((id) => memberOfAuth(members, id)?.name)
    .filter((n): n is string => !!n)
}

export function discussionState(s: WaitingSession, members: readonly WaitingMember[], selfAuthId: string | null): DiscussionState {
  if (s.settled_at) return { kind: 'settled' }
  const msgs = readMessages(s.messages)
  if (msgs.length === 0) return { kind: 'empty' }
  const people = discussionPeople(s, members)
  if (people.length < 2) return { kind: 'just-you' }
  const last = msgs[msgs.length - 1]
  // Whose word it was: Symphony speaks for whoever asked it.
  let speaker: string | null | undefined = last.author?.id
  if (isSymphony(last)) {
    const asker = [...msgs].reverse().find((m) => !isSymphony(m))
    speaker = asker?.author?.id
    // An answer is for the asker to read; it waits on them.
    if (speaker === selfAuthId) return { kind: 'waiting-on-you' }
    return { kind: 'waiting-on-them', names: namesOf([speaker], members) }
  }
  if (last.askedSymphony) {
    return speaker === selfAuthId ? { kind: 'waiting-on-them', names: ['Symphony'] } : { kind: 'waiting-on-them', names: namesOf([speaker], members) }
  }
  if (speaker && speaker === selfAuthId) {
    return { kind: 'waiting-on-them', names: namesOf(people.filter((id) => id !== selfAuthId), members) }
  }
  return people.includes(selfAuthId ?? '') ? { kind: 'waiting-on-you' } : { kind: 'waiting-on-them', names: namesOf(people.filter((id) => id !== speaker), members) }
}

function namesOf(ids: (string | null | undefined)[], members: readonly WaitingMember[]): string[] {
  return ids.map((id) => memberOfAuth(members, id)?.name).filter((n): n is string => !!n)
}

/** "You and Iris", "You, Iris and Ella", or "Just you". */
export function peopleLabel(others: readonly string[]): string {
  if (others.length === 0) return 'Just you'
  if (others.length === 1) return `You and ${others[0]}`
  return `You, ${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`
}

/** "Iris", "Iris and Ella". */
export function namesLabel(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** One line under the people: "Waiting on you", "Waiting on Iris", "Settled". */
export function stateLine(state: DiscussionState): string {
  switch (state.kind) {
    case 'settled': return 'Settled'
    case 'waiting-on-you': return 'Waiting on you'
    case 'waiting-on-them': return state.names.length ? `Waiting on ${namesLabel(state.names)}` : 'Open'
    case 'just-you': return 'Just you and Symphony'
    case 'empty': return 'Not started'
  }
}

/** The scope a thread on this item gets: the item's, unless it is with
 *  someone, which opens a private item's thread (not the item) to the pair. */
export function threadScopeFor(itemScope: Scope, withIds: readonly string[]): Scope {
  return withIds.length > 0 && itemScope === 'individual' ? 'couple' : itemScope
}
