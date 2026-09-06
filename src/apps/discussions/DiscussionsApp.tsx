// src/apps/discussions/DiscussionsApp.tsx
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
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
  const chrome = useAppShellChromeOptional()

  return (
    <div className={PAGE_COLUMN_WIDE}>
      {/* The same masthead card the rest of the top group wears. */}
      <MastheadCard
        title="Discussions"
        subline="Conversations on your tasks, routines, and events — newest first."
        controls={chrome ? <HomeChromeControls className="flex" /> : undefined}
      />

      {loading && rows.length === 0 && (
        <p className="text-[15px] text-neutral-400">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-[15px] text-neutral-400">
          Nothing to talk about yet. Open any item and start a Discussion.
        </p>
      )}

      <div className="space-y-1">
        {rows.map((row) => (
          <button
            key={row.sessionId}
            type="button"
            onClick={() => navigate(discussionHref(row))}
            className="card w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
                <ConceptIcon name={KIND_ICON[row.entityType]} size={15} decorative />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`flex-1 truncate text-[15px] ${row.unread ? 'font-semibold text-neutral-900' : 'text-neutral-800'}`}>
                    {row.title}
                  </span>
                  <span className="shrink-0 text-[12px] text-neutral-400">{formatRelativeTime(row.lastAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                  <span className={row.lastAuthor === 'Symphony' ? 'text-primary-700' : 'text-neutral-600'}>{row.lastAuthor}:</span>{' '}
                  {row.lastText}
                </span>
              </span>
              {row.unread && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500" aria-label="Unread" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
