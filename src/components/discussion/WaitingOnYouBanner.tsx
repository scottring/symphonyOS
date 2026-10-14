// src/components/discussion/WaitingOnYouBanner.tsx
//
// Phone: a discussion waiting on you is the first thing on the page (mockup
// "Talking with Iris", board 4 — Iris opens Symphony). Tapping it opens that
// discussion; more than one opens Discussions.

import type { InboxRow } from '@/lib/discussions/inbox'

export function WaitingOnYouBanner({ rows, onOpen }: { rows: InboxRow[]; onOpen: (row: InboxRow | null) => void }) {
  const waiting = rows.filter((r) => r.state.kind === 'waiting-on-you')
  if (waiting.length === 0) return null
  const first = waiting[0]
  const many = waiting.length > 1
  return (
    <button type="button" className="waiting-banner" onClick={() => onOpen(many ? null : first)}
      aria-label={many ? `${waiting.length} discussions waiting on you` : `${first.lastAuthor} is waiting on you about ${first.title}`}>
      <span style={{ minWidth: 0 }}>
        <span className="waiting-banner-eyebrow">Waiting on you{many ? ` · ${waiting.length}` : ''}</span>
        <span className="waiting-banner-line"><b>{first.lastAuthor}</b> about <b>{first.title}</b></span>
        <span className="waiting-banner-quote">“{first.lastText}”</span>
      </span>
      <span className="waiting-banner-go">{many ? 'See all' : 'Reply'}</span>
    </button>
  )
}
