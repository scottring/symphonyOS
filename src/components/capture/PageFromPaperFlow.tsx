import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LogIn, RotateCcw, X } from 'lucide-react'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'
import { PageReviewSheet, type PageReviewPayload } from '@/components/capture/PageReviewSheet'
import { usePageFromPaper } from '@/hooks/usePageFromPaper'
import { useCommitPage } from '@/hooks/useCommitPage'
import { isSessionExpired } from '@/lib/authErrors'
import { getAuthUser } from '@/lib/supabase'
import { readSampleIds, writeSampleIds } from '@/lib/firstWeek'
import type { ExistingTask } from '@/lib/planDuplicates'
import type { DomainId } from '@/lib/domains'
import type { FamilyMember } from '@/types/family'
import type { PageAltitude } from '@/lib/planParse'

function rememberedDomain(altitude: PageAltitude): DomainId | undefined {
  try {
    const raw = localStorage.getItem(`symphony.paper.domain.${altitude}`)
    return raw === 'work' || raw === 'family' || raw === 'personal' ? raw : undefined
  } catch {
    return undefined
  }
}

interface PageFromPaperFlowProps {
  members: FamilyMember[]
  onClose: () => void
  /** Open (not completed) tasks, for the sheet's Link / Keep separate offer. */
  existingTasks?: ExistingTask[]
  /** 'YYYY-MM-DD' → the day's event titles, for day-facts already on the calendar. */
  calendarTitlesByDay?: Map<string, string[]>
  /** Skip the camera and parse this blob on mount instead — the first-week
   *  card's "Use our sample page" offer, which hands over the bundled sample
   *  image rather than making a paperless household photograph anything. */
  initialBlob?: Blob
  /** Altitude for `initialBlob`. Defaults to 'week'. Ignored without initialBlob. */
  initialAltitude?: PageAltitude
  /** The page being committed is the bundled sample, not a real one — the
   *  rows it creates are tracked (client-side) so "Clear sample" can remove
   *  them once a real page replaces the need for it. */
  sample?: boolean
}

/**
 * Page-from-paper, end to end: camera (or file) → parse → review → commit.
 * Mounted by HomeViewContainer when the Today overflow item is chosen; every
 * exit path lands on onClose so the mount fully resets between runs.
 *
 * Owns `useCommitPage()` rather than taking a commit callback. That hook drags
 * in a fresh `useSupabaseTasks` (its own realtime channel plus a full task
 * refetch), `useNotes`, and `useFamilyMembers` — held by HomeViewContainer it
 * cost every Today load a duplicate channel and duplicate fetches for a flow
 * that is open for a few seconds a week. This component mounts only while the
 * flow is open, so those hooks instantiate only then.
 */
export function PageFromPaperFlow({ members, onClose, existingTasks, calendarTitlesByDay, initialBlob, initialAltitude, sample }: PageFromPaperFlowProps) {
  const { status, result, error, parseFromBlob, retry, reset } = usePageFromPaper(members)
  const { commitPage } = useCommitPage()
  const navigate = useNavigate()
  const [camera, setCamera] = useState(!initialBlob)
  // Which page is being snapped. Chosen in the camera modal; the client owns
  // the window, so it must own the altitude too. Week = the old behaviour.
  const [altitude, setAltitude] = useState<PageAltitude>(initialAltitude ?? 'week')
  const [committing, setCommitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // A bundled blob (the sample page) skips the camera entirely and parses on
  // mount, on whatever altitude the caller asked for.
  useEffect(() => {
    if (initialBlob) void parseFromBlob(initialBlob, initialAltitude ?? 'week')
    // Only ever runs for the mount this instance was given a blob for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleBlob = useCallback((blob: Blob) => {
    setCamera(false)
    void parseFromBlob(blob, altitude)
  }, [parseFromBlob, altitude])

  const handleFile = useCallback((file: File | null) => {
    if (file) handleBlob(file)
    else close()
  }, [handleBlob, close])

  const handleCommit = useCallback(async (payload: PageReviewPayload) => {
    setCommitting(true)
    try {
      // The sheet asks which layer the page belongs to; the payload carries it.
      const { route, createdTaskIds, createdNoteIds } = await commitPage({ ...payload, storagePath: result.storagePath, altitude: result.altitude })
      if (sample && (createdTaskIds.length || createdNoteIds.length)) {
        const { data: { user } } = await getAuthUser()
        if (user) {
          const existing = readSampleIds(user.id)
          writeSampleIds(user.id, {
            taskIds: [...existing.taskIds, ...createdTaskIds],
            noteIds: [...existing.noteIds, ...createdNoteIds],
          })
        }
      }
      reset()
      onClose()
      navigate(route)
    } finally {
      setCommitting(false)
    }
  }, [commitPage, reset, onClose, navigate, result.storagePath, result.altitude, sample])

  return (
    <>
      {/* Hidden file input — the camera modal's "pick a file" fallback. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      {camera && (
        <CameraCaptureModal
          altitude={altitude}
          onAltitudeChange={setAltitude}
          onCapture={handleBlob}
          onPickFile={() => {
            setCamera(false)
            fileInputRef.current?.click()
          }}
          onClose={close}
        />
      )}

      {status === 'parsing' && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-bg-elevated rounded-2xl shadow-2xl px-8 py-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            <span className="text-[15px] text-neutral-700">Reading your page…</span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={close}>
          <div className="bg-bg-elevated rounded-2xl shadow-2xl px-6 py-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] text-neutral-800 mb-1">
              {isSessionExpired(error) ? 'Signed out' : 'Couldn’t read the page'}
            </p>
            <p className="text-[13px] text-neutral-500 mb-4 break-words">{error}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="px-4 py-2 rounded-lg text-[14px] text-neutral-600 hover:bg-neutral-100 transition-colors">
                <X className="w-4 h-4 inline mr-1" />Close
              </button>
              {isSessionExpired(error) ? (
                <button
                  type="button"
                  onClick={() => window.location.assign('/?return=' + encodeURIComponent(window.location.pathname))}
                  className="btn-primary px-4 py-2 rounded-lg text-[14px]"
                >
                  <LogIn className="w-4 h-4 inline mr-1" />Sign in again
                </button>
              ) : (
                <button type="button" onClick={() => void retry()} className="btn-primary px-4 py-2 rounded-lg text-[14px]">
                  <RotateCcw className="w-4 h-4 inline mr-1" />Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <PageReviewSheet
          items={result.items}
          notes={result.notes}
          unclear={result.unclear}
          windowDates={result.windowDates}
          altitude={result.altitude}
          titlePeriod={result.titlePeriod}
          pageTitle={result.pageTitle}
          existingTasks={existingTasks}
          calendarTitlesByDay={calendarTitlesByDay}
          initialDomain={rememberedDomain(result.altitude)}
          members={members}
          committing={committing}
          onCommit={(payload) => void handleCommit(payload)}
          onClose={close}
        />
      )}
    </>
  )
}
