// src/apps/home/HomeOverview.tsx
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import type { Asset, Space } from '@/types/home'

export function HomeOverview() {
  const navigate = useNavigate()
  const { homes, loading: homesLoading, addHome } = useHomes()
  const home = homes[0]  // Phase 1A: one home

  const { rooms, loading: spacesLoading, addRoom } = useSpaces(home?.id)
  const { assets, needsDetailsAssets, loading: assetsLoading } = useAssets(home?.id)
  const [search, setSearch] = useState('')

  const assetsByRoom = useMemo(() => {
    const map = new Map<string, Asset[]>()
    for (const a of assets) {
      if (!a.spaceId) continue
      const list = map.get(a.spaceId) ?? []
      list.push(a)
      map.set(a.spaceId, list)
    }
    return map
  }, [assets])

  const filteredAssets = useMemo(() => {
    if (!search.trim()) return assets.slice(0, 10)
    const q = search.toLowerCase()
    return assets.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    ).slice(0, 20)
  }, [assets, search])

  if (homesLoading || spacesLoading || assetsLoading) {
    return <div className="p-6 text-neutral-500">Loading…</div>
  }

  if (!home) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="font-display text-3xl mb-4">Home</h1>
        <div className="card p-6">
          <p className="mb-4">You don't have a home set up yet.</p>
          <button
            className="btn-primary"
            onClick={async () => {
              const name = prompt('What should we call your home?', 'Main House')
              if (name) await addHome({ name })
            }}
          >
            Create my home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl">Home</h1>
        <div className="flex gap-2">
          <button
            className="btn-primary"
            onClick={() => navigate('/home/asset/new')}
          >+ Asset</button>
          <button
            className="px-4 py-2 rounded-md border border-neutral-300 hover:bg-neutral-50"
            onClick={async () => {
              const name = prompt('Room name')
              if (name) await addRoom({ name })
            }}
          >+ Room</button>
        </div>
      </header>

      {needsDetailsAssets.length > 0 && (
        <div className="card p-4 mb-6 flex items-center justify-between bg-amber-50 border-amber-200">
          <span>⚠ {needsDetailsAssets.length} asset{needsDetailsAssets.length === 1 ? '' : 's'} need details</span>
          <Link to="/inbox?section=home" className="text-primary-700 underline">Triage now →</Link>
        </div>
      )}

      <input
        className="input-base w-full mb-6"
        placeholder="Search assets…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <h2 className="font-display text-xl mb-3">Rooms</h2>
      {rooms.length === 0 ? (
        <p className="text-neutral-500 mb-6">No rooms yet. Add one to get started.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          {rooms.map((r) => (
            <RoomTile key={r.id} room={r} count={(assetsByRoom.get(r.id) ?? []).length} />
          ))}
        </div>
      )}

      <h2 className="font-display text-xl mb-3">Recent</h2>
      <ul className="space-y-2">
        {filteredAssets.map((a) => (
          <li key={a.id}>
            <Link
              to={`/home/asset/${a.id}`}
              className="block card p-3 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between">
                <span>{a.name}</span>
                <span className="text-sm text-neutral-500">
                  {(() => {
                    const roomName = rooms.find((r) => r.id === a.spaceId)?.name
                    return roomName ? `in ${roomName}` : '—'
                  })()}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RoomTile({ room, count }: { room: Space; count: number }) {
  return (
    <Link to={`/home/space/${room.id}`} className="block card p-0 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-[4/3] bg-neutral-200 flex items-center justify-center">
        {room.photoUrl ? (
          <img src={room.photoUrl} alt={room.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">🏠</span>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium">{room.name}</div>
        <div className="text-sm text-neutral-500">{count} item{count === 1 ? '' : 's'}</div>
      </div>
    </Link>
  )
}
