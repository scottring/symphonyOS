import { useEffect, useState } from 'react'
import type { Note } from '@/types/note'

interface Props {
  anchor: Date | null
  existingNotes: Pick<Note, 'id' | 'title' | 'content'>[]
  onCreateNew: (content: string, anchor: Date | null) => void
  onAppendExisting: (id: string, block: string, anchor: Date | null) => void
  onLinkExisting: (id: string) => void
  onClose: () => void
}

export function TimelineNoteComposer({ anchor, existingNotes, onCreateNew, onAppendExisting, onLinkExisting, onClose }: Props) {
  const [mode, setMode] = useState<'new' | 'link'>('new')
  const [text, setText] = useState('')
  const [selId, setSelId] = useState<string | null>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div className="card w-full md:max-w-md p-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setMode('new'); setText(''); setSelId(null) }} className={mode === 'new' ? 'btn-primary' : ''}>New note</button>
          <button onClick={() => { setMode('link'); setText(''); setSelId(null) }} className={mode === 'link' ? 'btn-primary' : ''}>Link existing</button>
        </div>

        {mode === 'new' && (
          <>
            <textarea
              autoFocus
              placeholder="Write a note…"
              value={text}
              onChange={e => setText(e.target.value)}
              className="input-base w-full h-32"
            />
            <button
              className="btn-primary mt-3"
              onClick={() => { if (text.trim()) { onCreateNew(text.trim(), anchor); onClose() } }}
            >
              Save note
            </button>
          </>
        )}

        {mode === 'link' && (
          <div className="space-y-2">
            {existingNotes.map(n => (
              <button
                key={n.id}
                onClick={() => { setSelId(n.id); setText('') }}
                className={`block w-full text-left px-3 py-2 rounded-lg border ${selId === n.id ? 'border-primary-400' : 'border-neutral-200'}`}
              >
                {n.title || n.content.slice(0, 40) || '(untitled)'}
              </button>
            ))}
            {selId && (
              <>
                <textarea
                  placeholder="Append a block…"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  className="input-base w-full h-24"
                />
                <div className="flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => { if (text.trim()) { onAppendExisting(selId, text.trim(), anchor); onClose() } }}
                  >
                    Append
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
