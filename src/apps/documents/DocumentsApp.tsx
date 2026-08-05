import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Plus } from 'lucide-react'
import { useDocuments, type SymphonyDocument } from '@/hooks/useDocuments'
import { useAuth } from '@/hooks/useAuth'
import { attachFile, analyzeAttachment, ATTACHMENT_ACCEPT } from '@/lib/taskAttachments'
import { DocumentRow } from './DocumentRow'
import { DocumentProposalRow } from '@/components/surface/sections/DocumentProposal'

function groupByOwner(docs: SymphonyDocument[]): [string, SymphonyDocument[]][] {
  const groups = new Map<string, SymphonyDocument[]>()
  for (const d of docs) {
    const key = d.owner?.trim() || 'Unassigned'
    const bucket = groups.get(key)
    if (bucket) bucket.push(d)
    else groups.set(key, [d])
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  )
}

export function DocumentsApp() {
  const {
    documents, proposals, isLoading, error,
    keepDocument, dismissDocument, setScope, deleteDocument, reload,
  } = useDocuments()
  const { user } = useAuth()
  const groups = useMemo(() => groupByOwner(documents), [documents])
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    setUploading(true)
    try {
      // A shelf document has no parent entity, so it hangs off the user
      // themselves — entity_type 'document', entity_id = the user's id.
      const result = await attachFile('document', user.id, file, file.name)
      if (result && (result.contentType.startsWith('image/') || result.contentType === 'application/pdf')) {
        // Classify it so it arrives already proposed rather than unlabeled.
        await analyzeAttachment(result.id, 'A document filed directly in the Documents shelf')
      }
      await reload()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-display text-neutral-900">Documents</h1>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          aria-label="Add a document"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] text-primary-700 hover:bg-primary-50 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {uploading ? 'Uploading…' : 'Add'}
        </button>
      </div>
      <p className="text-[14px] text-neutral-500 mb-6">
        Things you'll need again. Private unless you share them.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => void onPick(e)}
      />

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {proposals.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[12px] uppercase tracking-wide text-neutral-400 mb-2">Suggested</h2>
          {proposals.map((p) => (
            <DocumentProposalRow
              key={p.id}
              kind={p.kind}
              label={p.label}
              onKeep={() => void keepDocument(p.id)}
              onDismiss={() => void dismissDocument(p.id)}
            />
          ))}
        </section>
      )}

      {isLoading ? (
        <div className="text-sm text-neutral-400">Loading…</div>
      ) : documents.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No documents yet. When you attach something like a license or an insurance card,
          Symphony will offer to keep it here.
        </div>
      ) : (
        groups.map(([owner, docs]) => (
          <section key={owner} className="mb-8">
            <h2 className="text-[12px] uppercase tracking-wide text-neutral-400 mb-2">{owner}</h2>
            <div className="space-y-2">
              {docs.map((d) => (
                <DocumentRow
                  key={d.id}
                  document={d}
                  onToggleScope={() => void setScope(d.id, d.scope === 'private' ? 'household' : 'private')}
                  onDelete={() => void deleteDocument(d)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
