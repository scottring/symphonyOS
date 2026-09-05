import { useMemo, useState } from 'react'
import { NotebookPen, X } from 'lucide-react'
import { usePendingPages, type PendingPage } from '@/hooks/usePendingPages'
import { useCommitPage } from '@/hooks/useCommitPage'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { PageReviewSheet, type PageReviewPayload } from '@/components/capture/PageReviewSheet'
import type { FamilyMember } from '@/types/family'

/**
 * One quiet line per page the Supernote poller has read and nobody has looked
 * at yet. Deliberately not a count or a scoreboard — a waiting page is a thing
 * to do, and it disappears the moment it is done.
 *
 * `useCommitPage` (via `SupernotePageReview` below) pulls in `useSupabaseTasks`,
 * which opens its own realtime channel and refetches every task. This section
 * mounts inside `InboxView`, which already instantiates `useSupabaseTasks` —
 * so the review half is split out and only mounted while a sheet is actually
 * open, instead of paying that cost on every Inbox visit for a section that
 * is empty almost all the time.
 */
export function SupernotePagesSection() {
  const { members } = useFamilyMembers()
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])
  const { pages, dismiss } = usePendingPages(memberIds)
  const [openId, setOpenId] = useState<string | null>(null)

  if (pages.length === 0) return null

  const open = pages.find((p) => p.captureId === openId) ?? null

  return (
    <>
      <div className="mb-6 space-y-2">
        {pages.map((page) => (
          <div key={page.captureId} className="flex items-center gap-3 rounded-xl border border-neutral-200/70 bg-white px-3 py-2">
            <NotebookPen className="w-4 h-4 text-primary-600 shrink-0" />
            <span className="flex-1 min-w-0 text-[14px] text-neutral-700 truncate">
              Page from{' '}
              {page.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setOpenId(page.captureId)}
              aria-label={`Review page from ${page.label}`}
              className="text-[13px] font-medium px-2.5 py-1 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors shrink-0"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => void dismiss(page.captureId)}
              aria-label={`Dismiss page from ${page.label}`}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {open && (
        <SupernotePageReview
          page={open}
          members={members}
          dismiss={dismiss}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}

interface SupernotePageReviewProps {
  page: PendingPage
  members: FamilyMember[]
  dismiss: (captureId: string) => Promise<boolean>
  onClose: () => void
}

/**
 * The actual review sheet, mounted only while a page is open. Owns
 * `useCommitPage()` so the expensive hooks it drags in (a fresh
 * `useSupabaseTasks` realtime channel + task refetch, `useNotes`, `useDomain`)
 * instantiate only for the moment a review is in progress, not on every
 * Inbox render.
 */
function SupernotePageReview({ page, members, dismiss, onClose }: SupernotePageReviewProps) {
  const { commitPage } = useCommitPage()
  const [committing, setCommitting] = useState(false)

  const handleCommit = async (payload: PageReviewPayload) => {
    setCommitting(true)
    try {
      const { failures } = await commitPage({ ...payload, storagePath: page.result.storagePath })
      // Dismiss HARD DELETES the capture row, and a page cannot be re-parsed
      // from Symphony once it is gone — the only recovery is re-exporting from
      // the tablet. So a page whose commit lost anything stays put. Retrying it
      // may duplicate the items that did land, but a duplicate is visible and
      // deletable where a deleted page is not.
      if (failures === 0) await dismiss(page.captureId)
      onClose()
    } finally {
      setCommitting(false)
    }
  }

  return (
    <PageReviewSheet
      items={page.result.items}
      notes={page.result.notes}
      unclear={page.result.unclear}
      windowDates={page.result.windowDates}
      altitude={page.result.altitude}
      members={members}
      committing={committing}
      onCommit={(payload) => void handleCommit(payload)}
      onClose={onClose}
    />
  )
}
