import { useState } from 'react'
import type { TaskLink } from '@/types/task'
import { ConceptIcon } from '@/lib/conceptIcons'
import { AttachmentFacets, type FacetPromotions } from './AttachmentFacets'
import { PanelSection } from './PanelSection'

interface PanelLinksProps {
  links: TaskLink[] | undefined
  onAddLink?: (url: string) => void
  /** Promote a fact read off a link onto the item itself — same actions the
   *  attachment parse offers (use this address, call this number, add a prep
   *  task). Omitted = facets render read-only. */
  facetPromotions?: FacetPromotions
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function PanelLinks({ links, onAddLink, facetPromotions }: PanelLinksProps) {
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
    <PanelSection id="links" label="Links" preview={list.length ? `${list.length} link${list.length === 1 ? '' : 's'}` : undefined}>
      {list.map((link) => (
        <div key={link.url} className="mb-1">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
          >
            <span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100 text-sm"><ConceptIcon name="attachment" decorative /></span>
            <span className="flex-1 text-sm text-neutral-800 truncate">
              {link.title || hostname(link.url)}
            </span>
          </a>
          {/* What the page actually says, read once when the link was saved.
              The point of saving a link is the fact inside it; this puts the
              phone number on the card instead of two taps away. */}
          {link.facets && link.facets.length > 0 && (
            <div className="pl-2">
              <AttachmentFacets facets={link.facets} promotions={facetPromotions} />
            </div>
          )}
        </div>
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
    </PanelSection>
  )
}
