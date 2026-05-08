import { useState } from 'react'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { AssetKioskModal } from './AssetKioskModal'
import type { Asset } from '@/types/home'

interface Props {
  spaceId: string
  onBack: () => void
  onSelectSpace: (id: string) => void
}

export function SpaceKioskView({ spaceId, onBack, onSelectSpace }: Props) {
  const { homes } = useHomes()
  const home = homes[0]
  const { spaces } = useSpaces(home?.id)
  const { assets } = useAssets(home?.id)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)

  const space = spaces.find((s) => s.id === spaceId)
  if (!space) return <div className="p-8 text-center">Loading…</div>

  const isZone = space.spaceType === 'zone'
  const childZones = spaces.filter((s) => s.parentSpaceId === spaceId)
  const here = assets.filter((a) => a.spaceId === spaceId)
  const parent = isZone ? spaces.find((s) => s.id === space.parentSpaceId) : null
  const parentFacts = isZone ? (parent?.facts ?? []) : []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <button onClick={onBack} className="text-lg text-primary-700 mb-4">
        ← {isZone ? parent?.name : 'Rooms'}
      </button>

      <h1 className="font-display text-4xl mb-4">{space.name}</h1>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2">
          {space.photoUrl ? (
            <img src={space.photoUrl} alt={space.name} className="w-full rounded-lg" />
          ) : (
            <div className="aspect-[16/9] bg-neutral-200 rounded-lg flex items-center justify-center text-6xl">🏠</div>
          )}
        </div>
        {(space.facts.length > 0 || parentFacts.length > 0) && (
          <div className="card p-4">
            <h3 className="font-display text-xl mb-2">Facts</h3>
            <ul className="space-y-2 text-base">
              {space.facts.map((f, i) => (
                <li key={i}>
                  <div className="text-sm text-neutral-500">{f.label}</div>
                  <div>{f.value}</div>
                </li>
              ))}
              {parentFacts.length > 0 && (
                <li className="pt-2 border-t border-neutral-200 text-sm text-neutral-500">
                  Inherited from {parent?.name}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {!isZone && childZones.length > 0 && (
        <>
          <h2 className="font-display text-2xl mb-2">Zones</h2>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {childZones.map((z) => (
              <button key={z.id} onClick={() => onSelectSpace(z.id)} className="card p-4 text-left hover:bg-neutral-50">
                <div className="font-medium text-lg">{z.name}</div>
                <div className="text-sm text-neutral-500">
                  {assets.filter((a) => a.spaceId === z.id).length} items
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="font-display text-2xl mb-2">Assets</h2>
      <ul className="space-y-2">
        {here.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => setSelectedAsset(a)}
              className="w-full text-left card p-3 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between">
                <span>{a.name}</span>
                <span className="text-sm text-neutral-500">{a.assetType}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selectedAsset && (
        <AssetKioskModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  )
}
