import type { ConnectorMessage } from '../types.ts'

/** One item as the storyFeed returns it. Field names per
 * connectors/docs/classdojo-api.md, observed 2026-08-25. */
export interface FeedItem {
  _id: string
  time: string
  targetId: string
  targetType: string
  senderName?: string
  headerText?: string
  headerSubtext?: string
  pending?: boolean
  scheduled?: boolean
  contents?: { body?: string; attachments?: unknown[] } | null
}

/** One class-story post, normalized. The field names here are OURS — the
 * client adapts the wire format to this, so a ClassDojo API change touches
 * one file. */
export interface DojoPost {
  id: string
  createdAt: string
  author: string
  body: string
  targetId: string
  /** The class or school this post belongs to, as the feed labels it. Carried
   * so a target nobody is watching can be reported by name. */
  targetLabel: string
}

export function toDojoPosts(items: FeedItem[]): DojoPost[] {
  return items
    // Not live yet: pending posts await moderation, scheduled ones await
    // their send time. Either would surface a candidate for something that
    // has not actually been announced.
    .filter((i) => !i.pending && !i.scheduled)
    .map((i) => ({
      id: i._id,
      createdAt: i.time,
      author: (i.senderName ?? i.headerText ?? 'ClassDojo').trim(),
      body: (i.contents?.body ?? '').trim(),
      targetId: i.targetId,
      targetLabel: (i.headerSubtext ?? i.headerText ?? '').trim(),
    }))
    .filter((p) => p.body !== '')
}

export function toConnectorMessages(posts: DojoPost[], since: Date | null): ConnectorMessage[] {
  return posts
    .map((p) => ({ p, at: new Date(p.createdAt) }))
    .filter(({ p, at }) => {
      if (Number.isNaN(at.getTime())) return false
      if (p.body.trim() === '') return false
      if (since && at.getTime() <= since.getTime()) return false
      return true
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ p, at }) => ({ timestamp: at, sender: p.author, text: p.body }))
}

export interface DiscoveredTarget {
  targetId: string
  label: string
  posts: number
}

/** Targets present in the feed that nobody has allowlisted.
 *
 * The storyFeed is combined across every class AND school a parent belongs to,
 * and the poll keeps only the posts whose targetId is on the watchlist. That
 * filter is the privacy boundary and it stays — but dropping the rest in
 * silence is how the school-wide channel carrying PTO notices went unread.
 * Reporting what was dropped turns an invisible gap into a visible choice. */
export function discoverTargets(posts: DojoPost[], watchedTargetIds: string[]): DiscoveredTarget[] {
  const watched = new Set(watchedTargetIds)
  const found = new Map<string, DiscoveredTarget>()
  for (const p of posts) {
    if (watched.has(p.targetId)) continue
    const seen = found.get(p.targetId)
    if (seen) seen.posts += 1
    else found.set(p.targetId, { targetId: p.targetId, label: p.targetLabel || p.targetId, posts: 1 })
  }
  return [...found.values()]
}
