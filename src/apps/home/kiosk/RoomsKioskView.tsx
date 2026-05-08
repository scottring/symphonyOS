import { useState } from 'react'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { SpaceKioskView } from './SpaceKioskView'

export function RoomsKioskView() {
  const { homes, loading: homesLoading } = useHomes()
  const home = homes[0]
  const { rooms, loading: spacesLoading } = useSpaces(home?.id)
  const { assets, loading: assetsLoading } = useAssets(home?.id)

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null)

  if (homesLoading || spacesLoading || assetsLoading) {
    return <div className="p-8 text-center text-neutral-500">Loading…</div>
  }

  if (!home) {
    return <div className="p-8 text-center text-neutral-500">No home set up yet.</div>
  }

  if (selectedSpaceId) {
    return (
      <SpaceKioskView
        spaceId={selectedSpaceId}
        onBack={() => setSelectedSpaceId(null)}
        onSelectSpace={setSelectedSpaceId}
      />
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl mb-4">Rooms</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {rooms.map((r) => {
          const count = assets.filter((a) => a.spaceId === r.id).length
          return (
            <button
              key={r.id}
              onClick={() => setSelectedSpaceId(r.id)}
              className="card p-0 overflow-hidden text-left hover:shadow-md transition"
            >
              <div className="aspect-[4/3] bg-neutral-200 flex items-center justify-center">
                {r.photoUrl ? (
                  <img src={r.photoUrl} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl">🏠</span>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-lg">{r.name}</div>
                <div className="text-sm text-neutral-500">{count} item{count === 1 ? '' : 's'}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
