// src/apps/home/HomeOverview.tsx
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, House } from 'lucide-react'
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
      <div className="py-6 px-6 md:px-10 lg:px-14 max-w-2xl mr-auto">
        <h1 className="mb-4 font-display text-3xl text-neutral-900">Home</h1>
        <div className="border-y border-neutral-200 py-6">
          <p className="mb-4 text-[15px] text-neutral-700">You don't have a home set up yet.</p>
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
    <div className={PAGE_COLUMN_WIDE}>
      <MastheadCard
        variant="page"
        title="House"
        motif="house"
        subline="Rooms, the things in them, and what each one needs next."
        footer={
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
        }
      />

      {needsDetailsAssets.length > 0 && (
        <div className="mb-6 flex items-center justify-between gap-3 border-l-2 border-warning-500 bg-amber-50 px-4 py-3">
          <span className="flex items-center gap-2 text-[15px] text-neutral-800">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning-600" />
            {needsDetailsAssets.length} asset{needsDetailsAssets.length === 1 ? '' : 's'} need details
          </span>
          <Link to="/inbox?section=home" className="shrink-0 text-[14px] text-primary-700 hover:underline">Triage now</Link>
        </div>
      )}

      <input
        className="mb-6 w-full rounded-md border border-neutral-300 bg-bg-elevated px-3 py-2.5 text-[15px] text-neutral-800 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        placeholder="Search assets…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <h2 className="mb-3 font-display text-[22px] text-neutral-900">Rooms</h2>
      {rooms.length === 0 ? (
        <p className="mb-6 text-[15px] text-neutral-500">No rooms yet. Add one to get started.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          {rooms.map((r) => (
            <RoomTile key={r.id} room={r} count={(assetsByRoom.get(r.id) ?? []).length} />
          ))}
        </div>
      )}

      <h2 className="mb-3 font-display text-[22px] text-neutral-900">Recent</h2>
      <ul className="border-t border-neutral-300">
        {filteredAssets.map((a) => (
          <li key={a.id} className="border-b border-neutral-200">
            <Link
              to={`/home/asset/${a.id}`}
              className="block px-3 py-3.5 transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[16px] leading-snug text-neutral-800">{a.name}</span>
                <span className="shrink-0 text-[13px] text-neutral-500">
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
    <Link to={`/home/space/${room.id}`} className="block overflow-hidden rounded-md border border-neutral-200 transition-colors hover:border-neutral-300">
      <div className="flex aspect-[4/3] items-center justify-center bg-neutral-100">
        {room.photoUrl ? (
          <img src={room.photoUrl} alt={room.name} className="h-full w-full object-cover" />
        ) : (
          <House aria-hidden="true" className="h-8 w-8 text-neutral-300" />
        )}
      </div>
      <div className="p-3">
        <div className="text-[16px] leading-snug text-neutral-800">{room.name}</div>
        <div className="text-[13px] text-neutral-500">{count} item{count === 1 ? '' : 's'}</div>
      </div>
    </Link>
  )
}
