import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  type PinnedItem,
  type PinnableEntityType,
  type DbPinnedItem,
  dbPinnedItemToPinnedItem,
  shouldAutoUnpin,
  MAX_PINS,
} from '@/types/pin'

interface UsePinnedItemsReturn {
  pins: PinnedItem[]
  isLoading: boolean
  error: string | null

  // Actions
  pin: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  unpin: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  unpinById: (id: string) => Promise<boolean>
  reorder: (orderedIds: string[]) => Promise<void>
  markAccessed: (entityType: PinnableEntityType, entityId: string) => Promise<void>
  refreshStale: (id: string) => Promise<void>

  // Queries
  isPinned: (entityType: PinnableEntityType, entityId: string) => boolean
  canPin: () => boolean
}

export function usePinnedItems(): UsePinnedItemsReturn {
  const { user } = useAuth()
  const [pins, setPins] = useState<PinnedItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch pins on mount
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state on auth change
      setPins([])
      return
    }

    const fetchPins = async () => {
      setIsLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('pinned_items')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setIsLoading(false)
        return
      }

      const fetchedPins = (data as DbPinnedItem[]).map(dbPinnedItemToPinnedItem)

      // Auto-unpin items that are past the threshold
      const staleToUnpin = fetchedPins.filter((pin) => shouldAutoUnpin(pin.lastAccessedAt))
      if (staleToUnpin.length > 0) {
        // Delete stale items from database
        await supabase
          .from('pinned_items')
          .delete()
          .in('id', staleToUnpin.map((p) => p.id))
      }

      // Filter out auto-unpinned items
      const activePins = fetchedPins.filter((pin) => !shouldAutoUnpin(pin.lastAccessedAt))
      setPins(activePins)
      setIsLoading(false)
    }

    fetchPins()
  }, [user])

  // Pin an item
  const pin = useCallback(
    async (entityType: PinnableEntityType, entityId: string): Promise<boolean> => {
      if (!user) {
        setError('Must be logged in to pin items')
        return false
      }

      // Check if already pinned
      if (pins.some((p) => p.entityType === entityType && p.entityId === entityId)) {
        return true // Already pinned
      }

      // Check max limit
      if (pins.length >= MAX_PINS) {
        setError(`Maximum of ${MAX_PINS} pins reached. Unpin something first.`)
        return false
      }

      setError(null)

      // Optimistic update
      const optimisticPin: PinnedItem = {
        id: crypto.randomUUID(),
        entityType,
        entityId,
        displayOrder: pins.length,
        pinnedAt: new Date(),
        lastAccessedAt: new Date(),
        isStale: false,
      }
      setPins((prev) => [...prev, optimisticPin])

      // Insert into database
      const { data, error: insertError } = await supabase
        .from('pinned_items')
        .insert({
          user_id: user.id,
          entity_type: entityType,
          entity_id: entityId,
          display_order: pins.length,
        })
        .select()
        .single()

      if (insertError) {
        // Rollback
        setPins((prev) => prev.filter((p) => p.id !== optimisticPin.id))
        setError(insertError.message)
        return false
      }

      // Replace optimistic with real data
      const realPin = dbPinnedItemToPinnedItem(data as DbPinnedItem)
      setPins((prev) => prev.map((p) => (p.id === optimisticPin.id ? realPin : p)))
      return true
    },
    [user, pins]
  )

  // Unpin by entity type and id
  const unpin = useCallback(
    async (entityType: PinnableEntityType, entityId: string): Promise<boolean> => {
      if (!user) return false

      const pinToRemove = pins.find((p) => p.entityType === entityType && p.entityId === entityId)
      if (!pinToRemove) return true // Not pinned

      // Optimistic update
      setPins((prev) => prev.filter((p) => p.id !== pinToRemove.id))

      const { error: deleteError } = await supabase
        .from('pinned_items')
        .delete()
        .eq('id', pinToRemove.id)
        .eq('user_id', user.id)

      if (deleteError) {
        // Rollback
        setPins((prev) => [...prev, pinToRemove].sort((a, b) => a.displayOrder - b.displayOrder))
        setError(deleteError.message)
        return false
      }

      return true
    },
    [user, pins]
  )

  // Unpin by pin id
  const unpinById = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false

      const pinToRemove = pins.find((p) => p.id === id)
      if (!pinToRemove) return true

      // Optimistic update
      setPins((prev) => prev.filter((p) => p.id !== id))

      const { error: deleteError } = await supabase
        .from('pinned_items')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (deleteError) {
        // Rollback
        setPins((prev) => [...prev, pinToRemove].sort((a, b) => a.displayOrder - b.displayOrder))
        setError(deleteError.message)
        return false
      }

      return true
    },
    [user, pins]
  )

  // Reorder pins
  const reorder = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      if (!user) return

      // Optimistic update
      const oldPins = [...pins]
      const newPins = orderedIds
        .map((id, index) => {
          const pin = pins.find((p) => p.id === id)
          return pin ? { ...pin, displayOrder: index } : null
        })
        .filter((p): p is PinnedItem => p !== null)
      setPins(newPins)

      // Update each pin's display_order
      const updates = orderedIds.map((id, index) =>
        supabase
          .from('pinned_items')
          .update({ display_order: index })
          .eq('id', id)
          .eq('user_id', user.id)
      )

      const results = await Promise.all(updates)
      const hasError = results.some((r) => r.error)

      if (hasError) {
        // Rollback
        setPins(oldPins)
        setError('Failed to reorder pins')
      }
    },
    [user, pins]
  )

  // Mark a pin as accessed (resets stale timer)
  const markAccessed = useCallback(
    async (entityType: PinnableEntityType, entityId: string): Promise<void> => {
      if (!user) return

      const pin = pins.find((p) => p.entityType === entityType && p.entityId === entityId)
      if (!pin) return

      const now = new Date()

      // Optimistic update
      setPins((prev) =>
        prev.map((p) =>
          p.id === pin.id ? { ...p, lastAccessedAt: now, isStale: false } : p
        )
      )

      await supabase
        .from('pinned_items')
        .update({ last_accessed_at: now.toISOString() })
        .eq('id', pin.id)
        .eq('user_id', user.id)
    },
    [user, pins]
  )

  // Refresh a stale pin (reset lastAccessedAt)
  const refreshStale = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return

      const now = new Date()

      // Optimistic update
      setPins((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, lastAccessedAt: now, isStale: false } : p
        )
      )

      await supabase
        .from('pinned_items')
        .update({ last_accessed_at: now.toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)
    },
    [user]
  )

  // Check if an entity is pinned
  const isPinned = useCallback(
    (entityType: PinnableEntityType, entityId: string): boolean => {
      return pins.some((p) => p.entityType === entityType && p.entityId === entityId)
    },
    [pins]
  )

  // Check if we can add more pins
  const canPin = useCallback((): boolean => {
    return pins.length < MAX_PINS
  }, [pins])

  return {
    pins,
    isLoading,
    error,
    pin,
    unpin,
    unpinById,
    reorder,
    markAccessed,
    refreshStale,
    isPinned,
    canPin,
  }
}
