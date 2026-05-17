// src/hooks/useAssets.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Asset, AssetKind, AssetType, Domain } from '@/types/home'

interface DbAsset {
  id: string
  home_id: string
  space_id: string | null
  asset_kind: AssetKind
  asset_type: AssetType
  name: string
  photo_url: string | null
  purchase_date: string | null
  purchase_price: number | null
  warranty_expires_at: string | null
  serial_number: string | null
  manual_url: string | null
  tags: string[]
  details: Record<string, unknown>
  notes_id: string | null
  domain: Domain
  needs_details: boolean
  created_by: string
  created_at: string
  updated_at: string
}

function patchHasMeaningfulDetail(patch: Partial<Asset>): boolean {
  if (patch.purchaseDate) return true
  if (patch.purchasePrice !== undefined && patch.purchasePrice !== null) return true
  if (patch.warrantyExpiresAt) return true
  if (patch.serialNumber) return true
  if (patch.manualUrl) return true
  if (patch.assetType && patch.assetType !== 'other') return true
  if (patch.details && Object.values(patch.details).some((v) => v !== '' && v !== null && v !== undefined)) return true
  return false
}

function dbToAsset(db: DbAsset): Asset {
  return {
    id: db.id,
    homeId: db.home_id,
    spaceId: db.space_id,
    assetKind: db.asset_kind,
    assetType: db.asset_type,
    name: db.name,
    photoUrl: db.photo_url ?? undefined,
    purchaseDate: db.purchase_date ?? undefined,
    purchasePrice: db.purchase_price ?? undefined,
    warrantyExpiresAt: db.warranty_expires_at ?? undefined,
    serialNumber: db.serial_number ?? undefined,
    manualUrl: db.manual_url ?? undefined,
    tags: db.tags ?? [],
    details: db.details ?? {},
    notesId: db.notes_id,
    domain: db.domain,
    needsDetails: db.needs_details,
    createdBy: db.created_by,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function useAssets(homeId: string | undefined) {
  const { user } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !homeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssets([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('assets')
        .select('*')
        .eq('home_id', homeId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (e) { setError(e.message); setLoading(false); return }
      setAssets((data as DbAsset[]).map(dbToAsset))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, homeId])

  const needsDetailsAssets = useMemo(
    () => assets.filter((a) => a.needsDetails),
    [assets],
  )

  const captureAsset = useCallback(async (input: {
    name: string
    spaceId: string | null
    photoUrl?: string
    assetKind?: AssetKind
  }): Promise<Asset | null> => {
    if (!user || !homeId) return null
    const { data, error: e } = await supabase
      .from('assets')
      .insert({
        home_id: homeId,
        space_id: input.spaceId,
        asset_kind: input.assetKind ?? 'item',
        asset_type: 'other',
        name: input.name,
        photo_url: input.photoUrl ?? null,
        needs_details: true,
        created_by: user.id,
      })
      .select('*').single()
    if (e || !data) { setError(e?.message ?? 'insert failed'); return null }
    const a = dbToAsset(data as DbAsset)
    setAssets((prev) => [a, ...prev])
    return a
  }, [user, homeId])

  const updateAsset = useCallback(async (id: string, patch: Partial<Asset>): Promise<void> => {
    // Map camelCase patch keys to snake_case for the DB
    const dbPatch: Record<string, unknown> = {}
    if (patch.name !== undefined) dbPatch.name = patch.name
    if (patch.spaceId !== undefined) dbPatch.space_id = patch.spaceId
    if (patch.assetKind !== undefined) dbPatch.asset_kind = patch.assetKind
    if (patch.assetType !== undefined) dbPatch.asset_type = patch.assetType
    if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl
    if (patch.purchaseDate !== undefined) dbPatch.purchase_date = patch.purchaseDate
    if (patch.purchasePrice !== undefined) dbPatch.purchase_price = patch.purchasePrice
    if (patch.warrantyExpiresAt !== undefined) dbPatch.warranty_expires_at = patch.warrantyExpiresAt
    if (patch.serialNumber !== undefined) dbPatch.serial_number = patch.serialNumber
    if (patch.manualUrl !== undefined) dbPatch.manual_url = patch.manualUrl
    if (patch.tags !== undefined) dbPatch.tags = patch.tags
    if (patch.details !== undefined) dbPatch.details = patch.details
    if (patch.notesId !== undefined) dbPatch.notes_id = patch.notesId
    if (patch.domain !== undefined) dbPatch.domain = patch.domain
    if (patch.needsDetails !== undefined) dbPatch.needs_details = patch.needsDetails

    // Auto-clear needs_details when the patch supplies meaningful detail content.
    // Only flips to false; never re-raises the flag.
    if (patch.needsDetails === undefined && patchHasMeaningfulDetail(patch)) {
      dbPatch.needs_details = false
    }

    const { error: e } = await supabase.from('assets').update(dbPatch).eq('id', id)
    if (e) { setError(e.message); return }
    const autoCleared = dbPatch.needs_details === false && patch.needsDetails === undefined
    setAssets((prev) => prev.map((a) => {
      if (a.id !== id) return a
      const next = { ...a, ...patch, updatedAt: new Date() } as Asset
      if (autoCleared) next.needsDetails = false
      return next
    }))
  }, [])

  const deleteAsset = useCallback(async (id: string): Promise<void> => {
    const { error: e } = await supabase.from('assets').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return { assets, needsDetailsAssets, loading, error, captureAsset, updateAsset, deleteAsset }
}
