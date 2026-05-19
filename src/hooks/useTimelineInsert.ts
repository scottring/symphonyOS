import { useState, useCallback } from 'react'
import { computeAnchorTime, type AnchorInput } from '@/lib/timelineAnchor'
import type { InsertKind } from '@/components/schedule/TimelineInsertPoint'

interface NoteComposerState { anchor: Date | null }

export function useTimelineInsert() {
  const [noteComposer, setNoteComposer] = useState<NoteComposerState | null>(null)
  const handlePick = useCallback((ctx: AnchorInput, kind: InsertKind) => {
    if (kind === 'note') setNoteComposer({ anchor: computeAnchorTime(ctx) })
    // task/event/routine: handled inline by TimelineInsertPoint → onCreate
  }, [])
  const closeNoteComposer = useCallback(() => setNoteComposer(null), [])
  return { handlePick, noteComposer, closeNoteComposer }
}
