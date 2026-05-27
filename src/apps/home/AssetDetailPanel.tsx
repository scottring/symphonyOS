import { useRef, useState } from 'react'
import type { Asset, AssetKind, AssetType, Space } from '@/types/home'
import { assetTypeLabel } from '@/types/home'
import { ASSET_TYPE_FIELDS } from './assetTypes'

const ASSET_TYPES: AssetType[] = [
  'appliance', 'vehicle', 'electronics', 'furniture', 'fixture', 'tool', 'collection', 'other',
]

interface Props {
  asset: Asset
  spaces: Space[]
  onClose: () => void
  onUpdate: (patch: Partial<Asset>) => void | Promise<void>
  onDelete: () => void | Promise<void>
  onUploadPhoto?: (file: File) => Promise<string | undefined>
}

export function AssetDetailPanel({ asset, spaces, onClose, onUpdate, onDelete, onUploadPhoto }: Props) {
  const photoInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handlePhotoFile(file: File) {
    if (!onUploadPhoto) return
    setUploading(true)
    const url = await onUploadPhoto(file)
    setUploading(false)
    if (url) await onUpdate({ photoUrl: url })
  }

  return (
    <div className="card p-4 max-w-xl w-full">
      <div className="flex items-center justify-between mb-3">
        <InlineText
          value={asset.name}
          onCommit={(v) => onUpdate({ name: v })}
          className="font-display text-2xl"
        />
        <div className="flex items-center gap-3">
          {asset.needsDetails && (
            <button
              type="button"
              onClick={() => onUpdate({ needsDetails: false })}
              className="text-sm text-primary-700 hover:underline"
            >Mark as done</button>
          )}
          <button onClick={onClose} aria-label="Close" className="text-neutral-500 text-xl">✕</button>
        </div>
      </div>

      <div className="mb-3">
        {asset.photoUrl ? (
          <img src={asset.photoUrl} alt={asset.name} className="w-full rounded-md" />
        ) : (
          <div className="w-full aspect-[4/3] rounded-md bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
            No photo
          </div>
        )}
        {onUploadPhoto && (
          <>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handlePhotoFile(f)
              }}
            />
            <button
              type="button"
              className="mt-2 text-sm text-primary-700 hover:underline"
              disabled={uploading}
              onClick={() => photoInput.current?.click()}
            >{uploading ? 'Uploading…' : asset.photoUrl ? 'Replace photo' : 'Add photo'}</button>
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-y-2 text-sm items-center">
        <dt className="text-neutral-500">Type</dt>
        <dd>
          <select
            aria-label="Type"
            className="input-base w-full"
            value={asset.assetType}
            onChange={(e) => onUpdate({ assetType: e.target.value as AssetType })}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>{assetTypeLabel(t)}</option>
            ))}
          </select>
        </dd>

        <dt className="text-neutral-500">Kind</dt>
        <dd>
          <select
            aria-label="Kind"
            className="input-base w-full"
            value={asset.assetKind}
            onChange={(e) => onUpdate({ assetKind: e.target.value as AssetKind })}
          >
            <option value="item">Item</option>
            <option value="collection">Collection</option>
          </select>
        </dd>

        <dt className="text-neutral-500">Where</dt>
        <dd>
          <select
            aria-label="Where"
            className="input-base w-full"
            value={asset.spaceId ?? ''}
            onChange={(e) => onUpdate({ spaceId: e.target.value || null })}
          >
            <option value="">— unassigned —</option>
            {spaces.map((s) => {
              const parent = s.parentSpaceId ? spaces.find((p) => p.id === s.parentSpaceId) : null
              const label = parent ? `${parent.name} › ${s.name}` : s.name
              return <option key={s.id} value={s.id}>{label}</option>
            })}
          </select>
        </dd>

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

        <dt className="text-neutral-500">Code / password</dt>
        <dd>
          <SecretText
            value={String(asset.details.access_code ?? '')}
            onCommit={(v) => onUpdate({ details: { ...asset.details, access_code: v || undefined } })}
            placeholder="Gate code, lock combo, Wi-Fi…"
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

function SecretText({
  value, onCommit, placeholder,
}: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        className="input-base w-full"
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
    <span className="inline-flex items-center gap-2">
      <span
        onClick={() => { setDraft(value); setEditing(true) }}
        className={`cursor-text inline-block -mx-1 px-1 rounded hover:bg-neutral-100 font-mono ${value ? '' : 'text-neutral-400 font-sans'}`}
        title="Click to edit"
      >
        {value ? (revealed ? value : '•'.repeat(Math.min(value.length, 12))) : (placeholder || '—')}
      </span>
      {value && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="text-xs text-primary-700 hover:underline"
        >{revealed ? 'Hide' : 'Show'}</button>
      )}
    </span>
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
        className={`input-base w-full ${className ?? ''}`}
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
      className={`cursor-text inline-block -mx-1 px-1 rounded hover:bg-neutral-100 ${className ?? ''} ${value ? '' : 'text-neutral-400'}`}
      title="Click to edit"
    >
      {value || placeholder || '—'}
    </span>
  )
}
