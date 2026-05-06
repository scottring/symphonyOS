import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { ReferenceFactsCard } from './facts/ReferenceFactsCard'

export function SpaceView() {
  const { id } = useParams<{ id: string }>()
  const { homes } = useHomes()
  const home = homes[0]

  const { spaces, updateSpace, addZone } = useSpaces(home?.id)
  const { assets, captureAsset } = useAssets(home?.id)

  const space = useMemo(() => spaces.find((s) => s.id === id), [spaces, id])
  const childZones = useMemo(
    () => spaces.filter((s) => s.parentSpaceId === id),
    [spaces, id],
  )
  const here = useMemo(() => assets.filter((a) => a.spaceId === id), [assets, id])

  if (!space) return <div className="p-6 text-neutral-500">Loading…</div>

  const isZone = space.spaceType === 'zone'
  const parent = isZone ? spaces.find((s) => s.id === space.parentSpaceId) : null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link to={isZone ? `/home/space/${parent?.id}` : '/home'} className="text-sm text-primary-700">
          ← {isZone ? parent?.name : 'Home'}
        </Link>
        <h1 className="font-display text-2xl">{space.name}</h1>
        <button
          className="text-sm text-neutral-500"
          onClick={async () => {
            const name = prompt('Rename', space.name)
            if (name) await updateSpace(space.id, { name })
          }}
        >Edit</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 card p-0 overflow-hidden">
          <div className="aspect-[16/9] bg-neutral-200 flex items-center justify-center">
            {space.photoUrl ? (
              <img src={space.photoUrl} alt={space.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">🏠</span>
            )}
          </div>
        </div>
        <ReferenceFactsCard
          spaceId={space.id}
          facts={space.facts}
          updateSpace={(id, patch) => updateSpace(id, patch)}
        />
      </div>

      {!isZone && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-lg">Zones</h2>
            <button
              className="text-sm text-primary-700"
              onClick={async () => {
                const name = prompt('Zone name')
                if (name && id) await addZone({ parentSpaceId: id, name })
              }}
            >+ Zone</button>
          </div>
          {childZones.length === 0 ? (
            <p className="text-sm text-neutral-500 mb-6">No zones yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {childZones.map((z) => (
                <Link key={z.id} to={`/home/space/${z.id}`} className="card p-3 hover:bg-neutral-50">
                  <div className="font-medium">{z.name}</div>
                  <div className="text-sm text-neutral-500">
                    {assets.filter((a) => a.spaceId === z.id).length} items
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-lg">Assets</h2>
        <button
          className="text-sm text-primary-700"
          onClick={async () => {
            const name = prompt('Asset name')
            if (name) await captureAsset({ name, spaceId: id ?? null })
          }}
        >+ Asset here</button>
      </div>
      {here.length === 0 ? (
        <p className="text-sm text-neutral-500">No assets here yet.</p>
      ) : (
        <ul className="space-y-2">
          {here.map((a) => (
            <li key={a.id}>
              <Link to={`/home/asset/${a.id}`} className="block card p-3 hover:bg-neutral-50">
                <div className="flex items-center justify-between">
                  <span>{a.name}</span>
                  <span className="text-xs text-neutral-500">{a.assetType}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
