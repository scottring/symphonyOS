import { useState } from 'react'
import type { TaskLink } from '@/types/task'
import { ConceptIcon } from '@/lib/conceptIcons'

interface PanelLinksProps {
  links: TaskLink[] | undefined
  onAddLink?: (url: string) => void
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function PanelLinks({ links, onAddLink }: PanelLinksProps) {
  const [draft, setDraft] = useState('')
  const list = links ?? []

  if (list.length === 0 && !onAddLink) return null

  function commit() {
    const url = draft.trim()
    if (url && onAddLink) {
      onAddLink(url)
      setDraft('')
    }
  }

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Links</div>
      {list.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100 text-sm"><ConceptIcon name="attachment" decorative /></span>
          <span className="flex-1 text-sm text-neutral-800 truncate">
            {link.title || hostname(link.url)}
          </span>
        </a>
      ))}
      {onAddLink && (
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
          onBlur={commit}
          placeholder="Paste a URL…"
          className="w-full text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
        />
      )}
    </section>
  )
}
