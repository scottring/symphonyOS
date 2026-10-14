// src/apps/discussions/DiscussionsApp.tsx
//
// Discussions: what you and the people you talk with have open, by whose turn
// it is (Scott, 2026-10-14; mockup "Talking with Iris", approved): Waiting on
// you, Waiting on Iris, Just you and Symphony, Settled this week. Reached from
// the speech-bubble count in the top bar.
//
// A row opens its discussion right here, in the drawer; "About" in the drawer
// opens the item (`?discuss=1`) for anyone who can see it. A private item's
// discussion opened to Iris shows her the conversation and its name only.

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { LIST_ROW, LIST_ROW_LANE, LIST_ROW_BODY, LIST_ROW_TITLE, LIST_ROW_META, LIST_ROW_TRAIL } from '@/components/layout/listRow'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'
import { formatRelativeTime } from '@/lib/timeUtils'
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox'
import { AssistDrawer } from '@/components/assist/AssistDrawer'
import type { InboxRow } from '@/lib/discussions/inbox'
import { namesLabel } from '@/lib/discussions/waiting'
import { groupDiscussions } from '@/lib/discussions/groups'
import type { Scope } from '@/lib/scope'

const KIND_ICON: Record<InboxRow['entityType'], ConceptName> = {
  task: 'task',
  routine: 'routine',
  event: 'when',
}

export function discussionHref(row: Pick<InboxRow, 'entityType' | 'entityId'>): string {
  return `/today?detail=${row.entityType}:${row.entityId}&discuss=1`
}

export function DiscussionsApp() {
  const navigate = useNavigate()
  const { rows, loading, reload } = useDiscussionInbox()
  const [picked, setPicked] = useState<InboxRow | null>(null)
  const groups = groupDiscussions(rows)
  // `?open=<session>` (the phone's Waiting on you) opens that discussion.
  const [params, setParams] = useSearchParams()
  const wanted = params.get('open')
  const open = picked ?? (wanted ? rows.find((r) => r.sessionId === wanted) ?? null : null)
  const setOpen = (row: InboxRow | null) => {
    setPicked(row)
    if (!row && wanted) setParams((p) => { p.delete('open'); return p }, { replace: true })
  }

  return (
    <div className={PAGE_COLUMN}>
      <MastheadCard
        variant="page"
        title="Discussions"
        motif="discussions"
        subline="What you're talking about, and whose turn it is."
        controls={undefined /* area + assistant: the top bar (2026-09-30) */}
      />

      {loading && rows.length === 0 && (
        <p className="py-4 text-[14px] text-neutral-400">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <EmptyState title="Nothing to talk about yet.">
          Open any item and choose Discussion to talk it over with someone. It lands here.
        </EmptyState>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="mb-6">
          <h2 className={`mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] ${g.urgent ? 'text-[#b84a26]' : 'text-neutral-500'}`}>
            {g.label} · {g.rows.length}
          </h2>
          <div>
            {g.rows.map((row) => (
              <button
                key={row.sessionId}
                type="button"
                onClick={() => setOpen(row)}
                className={`${LIST_ROW} ${g.key === 'settled' ? 'opacity-80' : ''}`}
              >
                <span className={LIST_ROW_LANE}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
                    <ConceptIcon name={KIND_ICON[row.entityType]} size={15} decorative />
                  </span>
                </span>
                <span className={LIST_ROW_BODY}>
                  <span className={`${LIST_ROW_TITLE} ${row.unread ? 'font-semibold' : ''}`}>
                    {row.title}
                  </span>
                  <span className={LIST_ROW_META}>
                    {g.key === 'settled' ? (
                      <>Settled{row.outcome ? `: ${row.outcome}` : ''}</>
                    ) : (
                      <>
                        {row.others.length > 0 && <span className="text-neutral-500">With {namesLabel(row.others)} · </span>}
                        <span className={row.lastAuthor === 'Symphony' ? 'text-primary-700' : 'text-neutral-600'}>{row.lastAuthor}:</span>{' '}
                        {row.lastText}
                      </>
                    )}
                  </span>
                </span>
                <span className={LIST_ROW_TRAIL}>
                  <span className="tabular-nums text-neutral-400">{formatRelativeTime(row.lastAt)}</span>
                  {/* The dot keeps its place whether or not it is lit, so the
                      times line up down the page. */}
                  <span className="flex w-2 justify-center">
                    {row.unread && g.key !== 'settled' && (
                      <span className="h-2 w-2 rounded-full bg-[#b84a26]" aria-label="Unread" />
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {open && (
        <AssistDrawer
          item={{ id: open.entityId, title: open.title, kind: open.entityType === 'routine' ? 'routine' : 'task' }}
          discuss={{ type: open.entityType, id: open.entityId, title: open.title, scope: (open.scope as Scope) }}
          onClose={() => { setOpen(null); void reload() }}
          onOpenItem={() => { const r = open; setOpen(null); navigate(discussionHref(r)) }}
        />
      )}
    </div>
  )
}
