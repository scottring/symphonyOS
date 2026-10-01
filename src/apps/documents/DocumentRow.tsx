import { useState, type KeyboardEvent } from 'react'
import { showToast } from '@/hooks/useToast'
import { FileText, Lock, Users, Trash2, ExternalLink, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { documentKindLabel } from '@/types/document'
import { daysUntil, EXPIRY_WARNING_DAYS, type SymphonyDocument } from '@/hooks/useDocuments'
import { LIST_ROW, LIST_ROW_LANE, LIST_ROW_BODY, LIST_ROW_TITLE } from '@/components/layout/listRow'

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
// The focus ring was a hardcoded sage green left over from an older palette.
const field =
  'w-full px-2.5 py-1.5 rounded-md text-[15px] bg-bg-elevated border border-neutral-300 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
const fieldLabel = 'block text-[11px] uppercase tracking-wide text-neutral-400 mb-1'

export function DocumentRow({ document, onToggleScope, onDelete, onSave }: Props) {
  const [opening, setOpening] = useState(false)
  // Scanned licences and insurance cards can't be recovered — ask first.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(document.storagePath, 3600)
    setOpening(false)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    else if (error) showToast("Couldn't open that document. Please try again.", 'error')
  }

  if (editing) {
    return (
      <div className="-mx-3 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-3">
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
    <div className={LIST_ROW}>
      <span className={LIST_ROW_LANE}>
        <FileText className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
      </span>
      <div className={LIST_ROW_BODY}>
        <div className={LIST_ROW_TITLE}>{document.label}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] leading-snug text-neutral-500">
          <span className="truncate">{documentKindLabel(document.kind)}</span>
          {note && (
            <>
              <span aria-hidden>·</span>
              <span
                className={`shrink-0 ${
                  note.tone === 'expired'
                    ? 'text-danger-600 font-medium'
                    : note.tone === 'warn'
                      ? 'text-warning-600 font-medium'
                      : ''
                }`}
              >
                {note.text}
              </span>
            </>
          )}
        </div>
      </div>
      {/* Quiet actions, trailing — a tighter gap than LIST_ROW_TRAIL's, since
          these are four icon buttons side by side. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={beginEdit} aria-label="Rename document" title="Rename" className={iconBtn}>
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onToggleScope} title={scopeLabel} aria-label={scopeLabel} className={iconBtn}>
          {document.scope === 'private' ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
        </button>
        <button onClick={() => void open()} disabled={opening} aria-label="Open document" className={iconBtn}>
          <ExternalLink className="w-4 h-4" />
        </button>
        {confirmingDelete ? (
          <span role="group" aria-label="Confirm delete" className="flex items-center gap-1">
            <button
              onClick={() => { setConfirmingDelete(false); onDelete() }}
              className="px-2 py-1 rounded-lg text-xs font-medium text-white bg-danger-600 hover:bg-danger-500"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="px-2 py-1 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete document"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-600 hover:bg-danger-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
