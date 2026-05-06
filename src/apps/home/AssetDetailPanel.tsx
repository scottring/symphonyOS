import { useState } from 'react'
import type { Asset } from '@/types/home'
import { assetTypeLabel } from '@/types/home'
import { ASSET_TYPE_FIELDS } from './assetTypes'

interface Props {
  asset: Asset
  onClose: () => void
  onUpdate: (patch: Partial<Asset>) => void | Promise<void>
  onDelete: () => void | Promise<void>
}

export function AssetDetailPanel({ asset, onClose, onUpdate, onDelete }: Props) {
  return (
    <div className="card p-4 max-w-xl w-full">
      <div className="flex items-center justify-between mb-3">
        <InlineText
          value={asset.name}
          onCommit={(v) => onUpdate({ name: v })}
          className="font-display text-2xl"
        />
        <button onClick={onClose} aria-label="Close" className="text-neutral-500 text-xl">✕</button>
      </div>

      {asset.photoUrl && (
        <img src={asset.photoUrl} alt={asset.name} className="w-full rounded-md mb-3" />
      )}

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-neutral-500">Type</dt>
        <dd>{assetTypeLabel(asset.assetType)}</dd>

        <dt className="text-neutral-500">Kind</dt>
        <dd>{asset.assetKind}</dd>

        <dt className="text-neutral-500">Purchased</dt>
        <dd>
          <InlineText
            value={asset.purchaseDate ?? ''}
            onCommit={(v) => onUpdate({ purchaseDate: v || undefined })}
            placeholder="YYYY-MM-DD"
          />
        </dd>

        <dt className="text-neutral-500">Warranty</dt>
        <dd>
          <InlineText
            value={asset.warrantyExpiresAt ?? ''}
            onCommit={(v) => onUpdate({ warrantyExpiresAt: v || undefined })}
            placeholder="YYYY-MM-DD"
          />
        </dd>

        <dt className="text-neutral-500">Serial</dt>
        <dd>
          <InlineText
            value={asset.serialNumber ?? ''}
            onCommit={(v) => onUpdate({ serialNumber: v || undefined })}
          />
        </dd>

        <dt className="text-neutral-500">Manual</dt>
        <dd>
          <InlineText
            value={asset.manualUrl ?? ''}
            onCommit={(v) => onUpdate({ manualUrl: v || undefined })}
            placeholder="URL"
          />
        </dd>

        {ASSET_TYPE_FIELDS[asset.assetType]?.map((f) => (
          <FieldPair key={f.key} label={f.label}>
            <InlineText
              value={String(asset.details[f.key] ?? '')}
              onCommit={(v) => onUpdate({ details: { ...asset.details, [f.key]: v } })}
            />
          </FieldPair>
        ))}
      </dl>

      <div className="mt-4 flex justify-end">
        <button
          className="text-sm text-red-600 hover:underline"
          onClick={onDelete}
        >Delete asset</button>
      </div>
    </div>
  )
}

function FieldPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function InlineText({
  value, onCommit, placeholder, className,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        className={`input-base ${className ?? ''}`}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true) }}
      className={`cursor-text ${className ?? ''} ${value ? '' : 'text-neutral-400'}`}
    >
      {value || placeholder || '—'}
    </span>
  )
}
