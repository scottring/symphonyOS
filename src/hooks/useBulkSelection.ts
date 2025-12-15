import { useState, useCallback, useEffect } from 'react'

interface UseBulkSelectionResult {
  isSelectionMode: boolean
  selectedIds: Set<string>
  enterSelectionMode: (initialId?: string) => void
  exitSelectionMode: () => void
  toggleSelection: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  isSelected: (id: string) => boolean
}

export function useBulkSelection(): UseBulkSelectionResult {
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Track if user has made any selection - only auto-exit after they've selected then deselected all
  const [hasHadSelection, setHasHadSelection] = useState(false)

  const enterSelectionMode = useCallback((initialId?: string) => {
    setIsSelectionMode(true)
    setHasHadSelection(false)
    if (initialId) {
      setSelectedIds(new Set([initialId]))
      setHasHadSelection(true)
    }
  }, [])

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false)
    setSelectedIds(new Set())
    setHasHadSelection(false)
  }, [])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        setHasHadSelection(true)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  )

  // Exit selection mode if all items are deselected (only after user has selected something)
  useEffect(() => {
    if (isSelectionMode && selectedIds.size === 0 && hasHadSelection) {
      // Small delay to prevent flickering when toggling last item
      const timeout = setTimeout(() => {
        if (selectedIds.size === 0) {
          setIsSelectionMode(false)
          setHasHadSelection(false)
        }
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isSelectionMode, selectedIds.size, hasHadSelection])

  // Escape key exits selection mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelectionMode) {
        exitSelectionMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSelectionMode, exitSelectionMode])

  return {
    isSelectionMode,
    selectedIds,
    enterSelectionMode,
    exitSelectionMode,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  }
}
