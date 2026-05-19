import { useState, useCallback } from 'react'
import { computeAnchorTime, type AnchorInput } from '@/lib/timelineAnchor'
import type { InsertKind } from '@/components/schedule/TimelineInsertPoint'

interface Callbacks {
  onCreateTaskAt: (when: Date | null) => void
  onCreateEventAt: (when: Date | null) => void
  onCreateRoutineAt: (when: Date | null) => void
}
interface NoteComposerState { anchor: Date | null }

export function useTimelineInsert(cb: Callbacks) {
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null)

  const handlePick = useCallback((ctx: AnchorInput, kind: InsertKind) => {
    const anchor = computeAnchorTime(ctx)
    switch (kind) {
      case 'task': return cb.onCreateTaskAt(anchor)
      case 'event': return cb.onCreateEventAt(anchor)
      case 'routine': return cb.onCreateRoutineAt(anchor)
      case 'note': return setNoteComposer({ anchor })
    }
  }, [cb])

  const closeNoteComposer = useCallback(() => setNoteComposer(null), [])
  return { handlePick, noteComposer, closeNoteComposer }
}
