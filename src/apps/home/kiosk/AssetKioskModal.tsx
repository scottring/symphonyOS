import type { Asset } from '@/types/home'
import { assetTypeLabel } from '@/types/home'

interface Props {
  asset: Asset
  onClose: () => void
}

export function AssetKioskModal({ asset, onClose }: Props) {
  const phoneUrl = `${window.location.origin}/home/asset/${asset.id}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">{asset.name}</h2>
          <button onClick={onClose} aria-label="Close" className="text-2xl">✕</button>
        </div>

        {asset.photoUrl && (
          <img src={asset.photoUrl} alt={asset.name} className="w-full max-h-96 object-contain mb-4" />
        )}

        <dl className="grid grid-cols-2 gap-y-2 text-base">
          <dt className="text-neutral-500">Type</dt>
          <dd>{assetTypeLabel(asset.assetType)}</dd>
          {asset.purchaseDate && (<>
            <dt className="text-neutral-500">Purchased</dt>
            <dd>{asset.purchaseDate}</dd>
          </>)}
          {asset.warrantyExpiresAt && (<>
            <dt className="text-neutral-500">Warranty</dt>
            <dd>until {asset.warrantyExpiresAt}</dd>
          </>)}
          {asset.serialNumber && (<>
            <dt className="text-neutral-500">Serial</dt>
            <dd>{asset.serialNumber}</dd>
          </>)}
        </dl>

        <div className="mt-6 pt-4 border-t border-neutral-200 text-center">
          <p className="text-sm text-neutral-500 mb-2">To edit, open on your phone:</p>
          <code className="text-base bg-neutral-100 px-3 py-1 rounded">{phoneUrl}</code>
        </div>
      </div>
    </div>
  )
}
