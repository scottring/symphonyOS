import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { supabase } from '@/lib/supabase'
import { ReferenceFactsCard } from './facts/ReferenceFactsCard'

export function SpaceView() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { homes } = useHomes()
  const home = homes[0]

  const { spaces, updateSpace, addZone } = useSpaces(home?.id)
  const { assets, captureAsset } = useAssets(home?.id)

  const photoInput = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function uploadSpacePhoto(file: File): Promise<string | undefined> {
    if (!user) return undefined
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${user.id}/${Date.now()}-${safeName}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    if (error) return undefined
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    return data?.publicUrl
  }

  async function handleSpacePhotoFile(file: File) {
    if (!id) return
    setUploadingPhoto(true)
    const url = await uploadSpacePhoto(file)
    setUploadingPhoto(false)
    if (url) await updateSpace(id, { photoUrl: url })
  }

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
          <div className="relative aspect-[16/9] bg-neutral-200 flex items-center justify-center">
            {space.photoUrl ? (
              <img src={space.photoUrl} alt={space.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">🏠</span>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleSpacePhotoFile(f)
              }}
            />
            <button
              type="button"
              className="absolute bottom-2 right-2 px-3 py-1.5 rounded-md bg-black/60 text-white text-xs hover:bg-black/75 disabled:opacity-50"
              disabled={uploadingPhoto}
              onClick={() => photoInput.current?.click()}
            >{uploadingPhoto ? 'Uploading…' : space.photoUrl ? 'Replace photo' : 'Add photo'}</button>
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
        <div className="flex items-center">
          {!isZone && (
            <Link
              to={`/home/space/${id}/session`}
              className="text-sm text-neutral-600 hover:text-primary-700 mr-2"
            >Start room session →</Link>
          )}
          <button
            className="text-sm text-primary-700"
            onClick={async () => {
              const name = prompt('Asset name')
              if (name) await captureAsset({ name, spaceId: id ?? null })
            }}
          >+ Asset here</button>
        </div>
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
