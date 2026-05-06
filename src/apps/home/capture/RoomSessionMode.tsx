import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useSpaces } from '@/hooks/useSpaces'
import { useAssets } from '@/hooks/useAssets'
import { supabase } from '@/lib/supabase'

export function RoomSessionMode() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { homes } = useHomes()
  const home = homes[0]
  const { spaces } = useSpaces(home?.id)
  const { captureAsset } = useAssets(home?.id)
  const room = spaces.find((s) => s.id === id)

  const [count, setCount] = useState(0)
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }
  }, [photoUrl])

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

  async function save() {
    if (!name.trim() || !id) return
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
    await captureAsset({ name: name.trim(), spaceId: id, photoUrl: url, assetKind: 'item' })
    setSaving(false)
    setCount((c) => c + 1)
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setName(''); setPhotoFile(null); setPhotoUrl(undefined)
    fileInput.current?.click()
  }

  if (!room) return <div className="p-6">Loading…</div>

  return (
    <div className="p-4 max-w-md mx-auto">
      <header className="card p-3 mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">Session</div>
          <div className="font-display text-lg">{room.name}</div>
          <div className="text-sm text-neutral-500">{count} added</div>
        </div>
        <button
          className="text-sm text-primary-700"
          onClick={() => navigate(`/home/space/${id}`)}
        >End session</button>
      </header>

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
          <img src={photoUrl} alt={name || 'captured asset photo'} className="rounded-md max-h-64 mx-auto" />
        ) : (
          <p className="text-neutral-500">Tap to take photo</p>
        )}
      </div>

      {uploadError && (
        <p className="text-sm text-red-600 mb-2" role="alert">Photo upload failed: {uploadError}</p>
      )}

      <label className="block mb-3">
        <span className="text-sm text-neutral-600">Name</span>
        <input
          className="input-base w-full"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
        />
      </label>

      <button
        type="button"
        className="btn-primary w-full"
        disabled={saving || !name.trim()}
        onClick={save}
      >{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
