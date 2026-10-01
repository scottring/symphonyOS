// src/apps/discussions/DiscussionsApp.tsx
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { LIST_ROW, LIST_ROW_LANE, LIST_ROW_BODY, LIST_ROW_TITLE, LIST_ROW_META, LIST_ROW_TRAIL } from '@/components/layout/listRow'
//
// The Discussions inbox: every item conversation you can see with activity,
// newest first. This is what makes item threads feel like messaging — a
// message on a task is no longer invisible until you happen to open that task.
//
// Rows open the item with its Discussion already open (`?discuss=1`, consumed
// by TaskDetailPanel). No composer here: a conversation always belongs to an
// item, which is the point.

import { useNavigate } from 'react-router-dom'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'
import { formatRelativeTime } from '@/lib/timeUtils'
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox'
import type { InboxRow } from '@/lib/discussions/inbox'

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
  const { rows, loading } = useDiscussionInbox()

  return (
    <div className={PAGE_COLUMN}>
      {/* The same masthead card the rest of the top group wears. */}
      <MastheadCard
        variant="page"
        title="Discussions"
        motif="discussions"
        subline="Conversations on your tasks, routines, and events — newest first."
        controls={undefined /* area + assistant: the top bar (2026-09-30) */}
      />

      {loading && rows.length === 0 && (
        <p className="py-4 text-[14px] text-neutral-400">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <EmptyState title="Nothing to talk about yet.">
          Open any item and start a Discussion — it lands here, newest first.
        </EmptyState>
      )}

      {/* The library row (layout system): the item's kind in the margin
          lane, the last message under the title, when it was said trailing. */}
      <div>
        {rows.map((row) => (
          <button
            key={row.sessionId}
            type="button"
            onClick={() => navigate(discussionHref(row))}
            className={`${LIST_ROW}`}
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
                <span className={row.lastAuthor === 'Symphony' ? 'text-primary-700' : 'text-neutral-600'}>{row.lastAuthor}:</span>{' '}
                {row.lastText}
              </span>
            </span>
            <span className={LIST_ROW_TRAIL}>
              <span className="tabular-nums text-neutral-400">{formatRelativeTime(row.lastAt)}</span>
              {/* The dot keeps its place whether or not it is lit, so the
                  times line up down the page. */}
              <span className="flex w-2 justify-center">
                {row.unread && (
                  <span className="h-2 w-2 rounded-full bg-primary-500" aria-label="Unread" />
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
