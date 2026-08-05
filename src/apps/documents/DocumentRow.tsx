import { useState, type KeyboardEvent } from 'react'
import { FileText, Lock, Users, Trash2, ExternalLink, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { documentKindLabel } from '@/types/document'
import { daysUntil, EXPIRY_WARNING_DAYS, type SymphonyDocument } from '@/hooks/useDocuments'

export interface DocumentEdits {
  label: string
  owner: string | null
  expiresOn: string | null
}

interface Props {
  document: SymphonyDocument
  onToggleScope: () => void
  onDelete: () => void
  onSave: (id: string, edits: DocumentEdits) => void
}

function expiryNote(expiresOn: string | null): { text: string; tone: 'warn' | 'expired' | 'quiet' } | null {
  const days = daysUntil(expiresOn)
  if (days === null) return null
  if (days < 0) return { text: 'Expired', tone: 'expired' }
  if (days === 0) return { text: 'Expires today', tone: 'warn' }
  if (days <= EXPIRY_WARNING_DAYS) return { text: `Expires in ${days} days`, tone: 'warn' }
  return { text: `Expires ${expiresOn}`, tone: 'quiet' }
}

const iconBtn = 'p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
const field =
  'w-full px-2.5 py-1.5 rounded-lg text-sm bg-white shadow-[inset_0_0_0_1px_#d4d4d4] focus:outline-none focus:shadow-[inset_0_0_0_2px_#5c8a5c]'
const fieldLabel = 'block text-[11px] uppercase tracking-wide text-neutral-400 mb-1'

export function DocumentRow({ document, onToggleScope, onDelete, onSave }: Props) {
  const [opening, setOpening] = useState(false)
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(document.label)
  const [owner, setOwner] = useState(document.owner ?? '')
  const [expiresOn, setExpiresOn] = useState(document.expiresOn ?? '')

  const note = expiryNote(document.expiresOn)
  const scopeLabel = document.scope === 'private' ? 'Private to you' : 'Shared with household'

  function beginEdit() {
    // Re-seed from the document so a previous cancel never leaks into this edit.
    setLabel(document.label)
    setOwner(document.owner ?? '')
    setExpiresOn(document.expiresOn ?? '')
    setEditing(true)
  }

  function save() {
    // A nameless document is unfindable, which defeats the shelf — refuse
    // rather than silently falling back to the file name.
    if (!label.trim()) return
    onSave(document.id, {
      label: label.trim(),
      owner: owner.trim() || null,
      expiresOn: expiresOn.trim() || null,
    })
    setEditing(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setEditing(false)
    if (e.key === 'Enter') save()
  }

  async function open() {
    setOpening(true)
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(document.storagePath, 3600)
    setOpening(false)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (editing) {
    return (
      <div className="px-4 py-3 rounded-xl bg-white shadow-[inset_0_0_0_1px_#c9dcc9]">
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
          <div>
            <label className={fieldLabel} htmlFor={`name-${document.id}`}>Document name</label>
            <input
              id={`name-${document.id}`}
              className={field}
              value={label}
              autoFocus
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor={`owner-${document.id}`}>Owner</label>
            <input
              id={`owner-${document.id}`}
              className={field}
              value={owner}
              placeholder="Anyone"
              onChange={(e) => setOwner(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor={`expires-${document.id}`}>Expires</label>
            <input
              id={`expires-${document.id}`}
              className={field}
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={save}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 rounded-lg text-[13px] text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <span className="text-[11px] text-neutral-400 ml-1">{documentKindLabel(document.kind)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white shadow-[inset_0_0_0_1px_#e5e7eb]">
      <FileText className="w-5 h-5 shrink-0 text-neutral-400" />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] text-neutral-800 truncate">{document.label}</div>
        <div className="flex items-center gap-2 text-[12px] text-neutral-500">
          <span>{documentKindLabel(document.kind)}</span>
          {note && (
            <>
              <span aria-hidden>·</span>
              <span
                className={
                  note.tone === 'expired'
                    ? 'text-red-600 font-medium'
                    : note.tone === 'warn'
                      ? 'text-amber-700 font-medium'
                      : ''
                }
              >
                {note.text}
              </span>
            </>
          )}
        </div>
      </div>
      <button onClick={beginEdit} aria-label="Rename document" title="Rename" className={iconBtn}>
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={onToggleScope} title={scopeLabel} aria-label={scopeLabel} className={iconBtn}>
        {document.scope === 'private' ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
      </button>
      <button onClick={() => void open()} disabled={opening} aria-label="Open document" className={iconBtn}>
        <ExternalLink className="w-4 h-4" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Delete document"
        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
