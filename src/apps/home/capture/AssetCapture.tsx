import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { supabase } from '@/lib/supabase'

export function AssetCapture() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialRoom = params.get('room') ?? ''
  const initialZone = params.get('zone') ?? ''

  const { homes } = useHomes()
  const home = homes[0]
  const { rooms, spaces } = useSpaces(home?.id)
  const { captureAsset } = useAssets(home?.id)

  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState(initialRoom)
  const [zoneId, setZoneId] = useState(initialZone)
  const [isCollection, setIsCollection] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)

  // Trigger camera on mount (mobile)
  useEffect(() => { fileInput.current?.click() }, [])

  const zonesForRoom = spaces.filter((s) => s.parentSpaceId === roomId)

  async function uploadPhoto(file: File): Promise<string | undefined> {
    if (!home) return undefined
    const path = `${home.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file, {
      cacheControl: '3600', upsert: false,
    })
    if (error) {
      setUploadError(error.message)
      throw error
    }
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    return data?.publicUrl
  }

  async function save(addAnother: boolean) {
    if (!name.trim() || !roomId) return
    setSaving(true)
    setUploadError(null)
    let url: string | undefined = undefined
    if (photoFile) {
      try {
        url = await uploadPhoto(photoFile)
      } catch {
        setSaving(false)
        return
      }
    }
    const spaceId = zoneId || roomId
    await captureAsset({
      name: name.trim(),
      spaceId,
      photoUrl: url,
      assetKind: isCollection ? 'collection' : 'item',
    })
    setSaving(false)
    if (addAnother) {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
      setName(''); setIsCollection(false); setPhotoFile(null); setPhotoUrl(undefined)
      // Re-trigger camera with same room/zone retained
      fileInput.current?.click()
    } else {
      navigate(`/home/space/${spaceId}`)
    }
  }

  // Revoke blob URL on unmount or when it changes
  useEffect(() => {
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }
  }, [photoUrl])

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="font-display text-2xl mb-4">Add asset</h1>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setPhotoFile(f)
            setPhotoUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev)
              return URL.createObjectURL(f)
            })
          }
        }}
      />

      <div
        className="card p-4 mb-3 text-center cursor-pointer"
        onClick={() => fileInput.current?.click()}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="captured" className="rounded-md max-h-64 mx-auto" />
        ) : (
          <p className="text-neutral-500">Take a photo</p>
        )}
      </div>

      {uploadError && (
        <p className="text-sm text-red-600 mb-2" role="alert">Photo upload failed: {uploadError}</p>
      )}

      <label className="block mb-2">
        <span className="text-sm text-neutral-600">Name</span>
        <input
          className="input-base w-full"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="block mb-2">
        <span className="text-sm text-neutral-600">Where</span>
        <select className="input-base w-full" value={roomId} onChange={(e) => { setRoomId(e.target.value); setZoneId('') }}>
          <option value="">Pick a room…</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>

      {roomId && zonesForRoom.length > 0 && (
        <label className="block mb-2">
          <span className="text-sm text-neutral-600">Zone (optional)</span>
          <select className="input-base w-full" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">— none —</option>
            {zonesForRoom.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
      )}

      <label className="flex items-center gap-2 mb-4 text-sm">
        <input type="checkbox" checked={isCollection} onChange={(e) => setIsCollection(e.target.checked)} aria-label="This is a collection" />
        This is a collection
      </label>

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={saving || !name.trim() || !roomId}
          onClick={() => save(false)}
        >{saving ? 'Saving…' : 'Save'}</button>
        <button
          className="px-4 py-2 rounded-md border border-neutral-300"
          disabled={saving || !name.trim() || !roomId}
          onClick={() => save(true)}
        >Save & add another</button>
      </div>
    </div>
  )
}
