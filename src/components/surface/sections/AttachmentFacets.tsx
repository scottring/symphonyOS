import { useState } from 'react'
import { CalendarClock, Check, Copy, KeyRound, Link2, ListChecks, MapPin, Phone, Plus, ShoppingBag } from 'lucide-react'
import type { Facet } from '@/types/facets'

export interface FacetPromotions {
  /** Set the entity's location (event location / task location). */
  onUseLocation?: (address: string) => void
  /** Create a prep task (event) or subtask (task) from a checklist item. */
  onAddPrepTask?: (title: string) => void
  /** Save a link onto the entity. */
  onAddLink?: (url: string) => void
  /** Save a phone number onto the entity (tasks only). */
  onSetPhone?: (number: string) => void
}

const chip = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white shadow-[inset_0_0_0_1px_#e5e7eb] text-sm text-neutral-700'
const promoteBtn = 'text-[11px] text-primary-600 hover:text-primary-700 font-medium'

function fmtDatetime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function withLabel(label: string | undefined, value: string): string {
  return label ? `${label}: ${value}` : value
}

/** Plain-text serialization of a parse, summary first — what "Copy all" puts on the clipboard. */
export function facetsToText(facets: Facet[]): string {
  const lines: string[] = []
  const ordered = [...facets.filter((f) => f.type === 'summary'), ...facets.filter((f) => f.type !== 'summary')]
  for (const f of ordered) {
    switch (f.type) {
      case 'summary':
        lines.push(f.text)
        break
      case 'location':
        lines.push(withLabel(f.label, f.address))
        break
      case 'access_code':
        lines.push(`${f.label}: ${f.code}`)
        break
      case 'phone':
        lines.push(withLabel(f.label, f.number))
        break
      case 'datetime':
        lines.push(`${f.label}: ${fmtDatetime(f.iso)}`)
        break
      case 'link':
        lines.push(withLabel(f.label, f.url))
        break
      case 'checklist':
        lines.push(`${f.label ?? 'Checklist'}:`)
        for (const item of f.items) lines.push(`- ${item}`)
        break
      case 'purchase_item':
        lines.push(`${f.name} — ${f.specs}`)
        break
    }
  }
  return lines.join('\n')
}

function CopyButton({ text, label, caption }: { text: string; label: string; caption?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className={
        caption
          ? 'inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-600'
          : 'inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-600'
      }
    >
      {copied ? <Check className="w-3.5 h-3.5 text-primary-600" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      {caption && <span>{copied ? 'Copied' : caption}</span>}
    </button>
  )
}

/**
 * The morphing attachment artifact: one deterministic renderer per facet type
 * (spec: docs/superpowers/specs/2026-07-14-attachment-facets-design.md).
 * Model output never reaches here unvalidated — parseFacets is the gate.
 * Promotion buttons appear only when the hosting panel wired a handler.
 */
export function AttachmentFacets({ facets, promotions }: { facets: Facet[]; promotions?: FacetPromotions }) {
  if (facets.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 w-full">
      {facets.length > 1 && (
        <div className="self-end">
          <CopyButton text={facetsToText(facets)} label="Copy all" caption="Copy all" />
        </div>
      )}
      {facets.map((f, i) => {
        switch (f.type) {
          case 'summary':
            return <p key={i} className="text-[12px] text-neutral-500 italic">{f.text}</p>
          case 'location':
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={chip}
                >
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                  <span>{f.label ? `${f.label}: ` : ''}{f.address}</span>
                </a>
                <CopyButton text={f.address} label="Copy address" />
                {promotions?.onUseLocation && (
                  <button type="button" className={promoteBtn} onClick={() => promotions.onUseLocation!(f.address)}>
                    Use as location
                  </button>
                )}
              </div>
            )
          case 'access_code':
            return (
              <div key={i} className={chip}>
                <KeyRound className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                <span className="text-neutral-500">{f.label}:</span>
                <span className="font-mono font-semibold text-[15px] tracking-wide">{f.code}</span>
                <CopyButton text={f.code} label={`Copy ${f.code}`} />
              </div>
            )
          case 'phone':
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <a href={`tel:${f.number}`} className={chip}>
                  <Phone className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                  <span>{f.label ? `${f.label}: ` : ''}{f.number}</span>
                </a>
                <CopyButton text={f.number} label="Copy phone number" />
                {promotions?.onSetPhone && (
                  <button type="button" aria-label="Save phone number" className={promoteBtn} onClick={() => promotions.onSetPhone!(f.number)}>
                    Save phone number
                  </button>
                )}
              </div>
            )
          case 'datetime':
            return (
              <div key={i} className={chip}>
                <CalendarClock className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                <span>{f.label}: {fmtDatetime(f.iso)}</span>
                <CopyButton text={fmtDatetime(f.iso)} label="Copy date" />
              </div>
            )
          case 'link':
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <a href={f.url} target="_blank" rel="noopener noreferrer" className={chip}>
                  <Link2 className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                  <span className="truncate max-w-[16rem]">{f.label ?? f.url}</span>
                </a>
                <CopyButton text={f.url} label="Copy link" />
                {promotions?.onAddLink && (
                  <button type="button" aria-label="Save link" className={promoteBtn} onClick={() => promotions.onAddLink!(f.url)}>
                    Save link
                  </button>
                )}
              </div>
            )
          case 'checklist':
            return (
              <div key={i} className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500">
                  <ListChecks className="w-3.5 h-3.5" aria-hidden />
                  {f.label ?? 'Checklist'}
                  <CopyButton text={f.items.join('\n')} label="Copy checklist" />
                </span>
                {f.items.map((item) => (
                  <div key={item} className="flex items-center gap-2 pl-5">
                    <span className="text-sm text-neutral-700">{item}</span>
                    {promotions?.onAddPrepTask && (
                      <button
                        type="button"
                        aria-label={`Add "${item}" as prep task`}
                        className={promoteBtn}
                        onClick={() => promotions.onAddPrepTask!(item)}
                      >
                        <Plus className="w-3 h-3 inline" aria-hidden /> prep task
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          case 'purchase_item':
            return (
              <div key={i} className={`${chip} items-start`}>
                <ShoppingBag className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" aria-hidden />
                <span><span className="font-medium">{f.name}</span> — {f.specs}</span>
                <CopyButton text={`${f.name} — ${f.specs}`} label="Copy item" />
              </div>
            )
        }
      })}
    </div>
  )
}
