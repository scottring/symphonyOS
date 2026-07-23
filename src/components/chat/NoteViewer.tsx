import { useEffect, useState } from 'react'
import { X, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface NoteViewerProps {
  noteId: string
  onClose: () => void
}

interface LoadedNote {
  id: string
  title: string | null
  content: string | null
  vault_path: string | null
  updated_at: string | null
}

/** Strip a leading YAML frontmatter block so it doesn't render as body text. */
function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end === -1) return md
  const after = md.indexOf('\n', end + 1)
  return after === -1 ? '' : md.slice(after + 1).replace(/^\s+/, '')
}

/** Inline markdown: **bold** and [text](url). Everything else is literal. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[1]}</strong>)
    } else {
      nodes.push(
        <a key={`${keyPrefix}-a${i}`} href={m[3]} target="_blank" rel="noopener noreferrer"
          className="text-primary-600 underline break-words">{m[2]}</a>,
      )
    }
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Minimal, dependency-free markdown: headings, bullets, bold, links, spacing. */
function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  let key = 0
  const flushList = () => {
    if (list.length === 0) return
    const items = list
    const k = key++
    blocks.push(
      <ul key={`ul${k}`} className="list-disc pl-5 my-2 space-y-1 text-sm text-neutral-700">
        {items.map((it, i) => <li key={i}>{renderInline(it, `ul${k}-${i}`)}</li>)}
      </ul>,
    )
    list = []
  }
  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) { list.push(bullet[1]); continue }
    flushList()
    if (heading) {
      const level = heading[1].length
      const cls = level === 1
        ? 'text-lg font-display font-semibold text-neutral-800 mt-4 mb-1'
        : level === 2
          ? 'text-base font-semibold text-neutral-800 mt-3 mb-1'
          : 'text-sm font-semibold text-neutral-700 mt-2 mb-0.5'
      blocks.push(<div key={`h${key}`} className={cls}>{renderInline(heading[2], `h${key++}`)}</div>)
    } else if (line.trim() === '') {
      blocks.push(<div key={`sp${key++}`} className="h-2" />)
    } else {
      blocks.push(
        <p key={`p${key}`} className="text-sm leading-relaxed text-neutral-700 my-1">
          {renderInline(line, `p${key++}`)}
        </p>,
      )
    }
  }
  flushList()
  return <div>{blocks}</div>
}

/**
 * In-app reader for a vault note. Opened from the assistant's source chips.
 * Fetches the note by id (RLS-scoped to the signed-in user) and renders its
 * markdown — no external app, no rebuild, works on every surface.
 */
export function NoteViewer({ noteId, onClose }: NoteViewerProps) {
  const [note, setNote] = useState<LoadedNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // The viewer is remounted per note (keyed on noteId in the host), so state
  // starts fresh — this effect only fetches; no synchronous resets needed.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Never SELECT * — the embedding column is huge and times out.
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, content, vault_path, updated_at')
        .eq('id', noteId)
        .single()
      if (cancelled) return
      if (error || !data) {
        setError('Could not load this note.')
      } else {
        setNote(data as LoadedNote)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [noteId])

  const title = note?.title || note?.vault_path?.split('/').pop() || 'Note'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-neutral-900/25" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-bg-elevated rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
          <FileText className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-display font-semibold text-neutral-800 leading-snug break-words">{title}</h2>
            {note?.vault_path && (
              <p className="text-xs text-neutral-400 mt-0.5 truncate">{note.vault_path}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          {loading && <p className="text-sm text-neutral-400">Loading note…</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {note && !loading && !error && (
            note.content && note.content.trim()
              ? <Markdown text={stripFrontmatter(note.content)} />
              : <p className="text-sm text-neutral-400">This note is empty.</p>
          )}
        </div>
      </div>
    </div>
  )
}
