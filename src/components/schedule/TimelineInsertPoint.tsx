import { useState, useEffect, useCallback, useRef } from 'react'
import type { ParserContext } from '@/lib/quickInputParser'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'
import { TimelineQuickInput, type TimelineCaptureResult } from './TimelineQuickInput'

export type InsertKind = 'note' | 'task' | 'event' | 'routine'

const SEGMENTS: { kind: InsertKind; label: string; concept: ConceptName }[] = [
  { kind: 'note', label: 'Note', concept: 'note' },
  { kind: 'task', label: 'Task', concept: 'task' },
  { kind: 'event', label: 'Event', concept: 'when' },
  { kind: 'routine', label: 'Routine', concept: 'routine' },
]

interface Props {
  onPick: (kind: InsertKind) => void
  onCreate: (kind: 'task' | 'event' | 'routine', r: TimelineCaptureResult) => void
  quickInput: {
    anchorTime: Date | null
    parserContext: ParserContext
    currentDomain: 'work' | 'family' | 'personal' | 'universal'
  }
}

export function TimelineInsertPoint({ onPick, onCreate, quickInput }: Props) {
  const [mode, setMode] = useState<'closed' | 'wheel' | 'input'>('closed')
  const [inputKind, setInputKind] = useState<'task' | 'event' | 'routine'>('task')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'closed') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMode('closed') }
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMode('closed')
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDocClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDocClick) }
  }, [mode])

  const pick = useCallback((k: InsertKind) => {
    if (k === 'note') { setMode('closed'); onPick('note'); return }
    setInputKind(k); setMode('input')
  }, [onPick])

  return (
    <div ref={rootRef} className="relative flex items-center justify-center h-6 group">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200 opacity-40 group-hover:opacity-100 transition-opacity" />
      <button
        type="button"
        aria-label="Add between items"
        onClick={() => setMode(v => v === 'closed' ? 'wheel' : 'closed')}
        className="relative z-10 w-7 h-7 min-w-[28px] rounded-full bg-primary-500 text-white text-base leading-none flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100 transition-opacity"
      >+</button>

      {mode === 'wheel' && (
        <div className="absolute z-20 bottom-8 flex gap-2 bg-white border border-neutral-200 rounded-2xl shadow-lg px-3 py-2">
          {SEGMENTS.map(s => (
            <button
              key={s.kind}
              type="button"
              aria-label={s.label}
              onClick={() => pick(s.kind)}
              className="w-16 h-16 min-w-[64px] rounded-xl border border-neutral-200 bg-white flex flex-col items-center justify-center gap-1 text-xs hover:bg-primary-50 active:scale-95 transition"
            >
              <ConceptIcon name={s.concept} size={20} decorative />{s.label}
            </button>
          ))}
        </div>
      )}

      {mode === 'input' && (
        <TimelineQuickInput
          kind={inputKind}
          anchorTime={quickInput.anchorTime}
          parserContext={quickInput.parserContext}
          currentDomain={quickInput.currentDomain}
          onSubmit={(r) => { setMode('closed'); onCreate(inputKind, r) }}
          onCancel={() => setMode('closed')}
        />
      )}
    </div>
  )
}
