import { useState, useCallback, useEffect, useRef } from 'react'
import type { Project } from '@/types/project'

const OPEN_BRAIN_URL = 'http://localhost:3001'
const SYNC_STORAGE_KEY = 'symphony-project-sync'

interface SyncState {
  [projectId: string]: {
    vaultSlug: string
    lastSyncedAt: string
  }
}

function getSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setSyncState(state: SyncState) {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(state))
}

/**
 * Map Symphony project status to vault-compatible status string.
 */
function mapStatusToVault(status: string): string {
  const map: Record<string, string> = {
    not_started: 'not_started',
    in_progress: 'in_progress',
    on_hold: 'on_hold',
    completed: 'completed',
  }
  return map[status] || status
}

/**
 * Generate a slug from a project name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function useProjectSync() {
  const [available, setAvailable] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const checkRef = useRef(false)

  // Check if Open Brain is reachable on mount
  const checkAvailability = useCallback(async () => {
    try {
      const res = await fetch(`${OPEN_BRAIN_URL}/api/projects`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      })
      setAvailable(res.ok)
    } catch {
      setAvailable(false)
    }
  }, [])

  useEffect(() => {
    if (!checkRef.current) {
      checkRef.current = true
      checkAvailability()
    }
  }, [checkAvailability])

  /**
   * Check if a project has been synced to the vault.
   */
  const isSynced = useCallback((projectId: string): boolean => {
    const state = getSyncState()
    return !!state[projectId]
  }, [])

  /**
   * Get the vault slug for a synced project.
   */
  const getVaultSlug = useCallback((projectId: string): string | null => {
    const state = getSyncState()
    return state[projectId]?.vaultSlug ?? null
  }, [])

  /**
   * Push a Symphony project to Open Brain vault.
   * Creates if new, updates if already synced.
   */
  const pushToVault = useCallback(async (project: Project): Promise<boolean> => {
    setSyncing(true)
    try {
      const state = getSyncState()
      const existing = state[project.id]

      const body = {
        title: project.name,
        status: mapStatusToVault(project.status),
        domain: project.context ?? undefined,
        notes: project.notes ?? undefined,
        symphonyId: project.id,
      }

      let res: Response

      if (existing) {
        // Update existing vault project
        res = await fetch(`${OPEN_BRAIN_URL}/api/projects/${existing.vaultSlug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        // Create new vault project
        res = await fetch(`${OPEN_BRAIN_URL}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (!res.ok) {
        console.error('Project sync failed:', await res.text())
        return false
      }

      const data = await res.json()
      const slug = existing?.vaultSlug ?? data.slug ?? slugify(project.name)

      // Update local sync state
      state[project.id] = {
        vaultSlug: slug,
        lastSyncedAt: new Date().toISOString(),
      }
      setSyncState(state)

      return true
    } catch (err) {
      console.error('Project sync error:', err)
      return false
    } finally {
      setSyncing(false)
    }
  }, [])

  /**
   * Pull all projects from Open Brain vault.
   * Returns vault projects with their Symphony IDs (if linked).
   */
  const pullFromVault = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch(`${OPEN_BRAIN_URL}/api/projects`)
      if (!res.ok) {
        console.error('Failed to pull projects from vault')
        return null
      }

      const data = await res.json()
      return data.projects as Array<{
        slug: string
        title: string
        status?: string
        domain?: string
        symphonyStatus?: string
        content?: string
      }>
    } catch (err) {
      console.error('Pull from vault error:', err)
      return null
    } finally {
      setSyncing(false)
    }
  }, [])

  return {
    available,
    syncing,
    isSynced,
    getVaultSlug,
    pushToVault,
    pullFromVault,
    checkAvailability,
  }
}
