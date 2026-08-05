import { useState } from 'react'
import { FileText, Lock, Users, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { documentKindLabel } from '@/types/document'
import { daysUntil, EXPIRY_WARNING_DAYS, type SymphonyDocument } from '@/hooks/useDocuments'

interface Props {
  document: SymphonyDocument
  onToggleScope: () => void
  onDelete: () => void
}

function expiryNote(expiresOn: string | null): { text: string; tone: 'warn' | 'expired' | 'quiet' } | null {
  const days = daysUntil(expiresOn)
  if (days === null) return null
  if (days < 0) return { text: 'Expired', tone: 'expired' }
  if (days === 0) return { text: 'Expires today', tone: 'warn' }
  if (days <= EXPIRY_WARNING_DAYS) return { text: `Expires in ${days} days`, tone: 'warn' }
  return { text: `Expires ${expiresOn}`, tone: 'quiet' }
}

export function DocumentRow({ document, onToggleScope, onDelete }: Props) {
  const [opening, setOpening] = useState(false)
  const note = expiryNote(document.expiresOn)

  async function open() {
    setOpening(true)
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(document.storagePath, 3600)
    setOpening(false)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const scopeLabel = document.scope === 'private' ? 'Private to you' : 'Shared with household'

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
      <button
        onClick={onToggleScope}
        title={scopeLabel}
        aria-label={scopeLabel}
        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
      >
        {document.scope === 'private' ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
      </button>
      <button
        onClick={() => void open()}
        disabled={opening}
        aria-label="Open document"
        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
      >
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
