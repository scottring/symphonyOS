import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useHomes } from '@/hooks/useHomes'
import { useAssets } from '@/hooks/useAssets'
import { useSpaces } from '@/hooks/useSpaces'
import { supabase } from '@/lib/supabase'
import { AssetDetailPanel } from './AssetDetailPanel'

export function AssetView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { homes } = useHomes()
  const home = homes[0]
  const { assets, updateAsset, deleteAsset } = useAssets(home?.id)
  const { spaces } = useSpaces(home?.id)

  const asset = useMemo(() => assets.find((a) => a.id === id), [assets, id])
  const space = useMemo(() => spaces.find((s) => s.id === asset?.spaceId), [spaces, asset])

  if (!asset) return <div className="p-6 text-neutral-500">Loading…</div>

  async function uploadPhoto(file: File): Promise<string | undefined> {
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link to={space ? `/home/space/${space.id}` : '/home'} className="text-sm text-primary-700">
          ← {space?.name ?? 'Home'}
        </Link>
      </div>

      <AssetDetailPanel
        asset={asset}
        spaces={spaces}
        onClose={() => navigate(space ? `/home/space/${space.id}` : '/home')}
        onUpdate={(patch) => updateAsset(asset.id, patch)}
        onUploadPhoto={uploadPhoto}
        onDelete={async () => {
          if (confirm(`Delete ${asset.name}?`)) {
            await deleteAsset(asset.id)
            navigate(space ? `/home/space/${space.id}` : '/home')
          }
        }}
      />
    </div>
  )
}
