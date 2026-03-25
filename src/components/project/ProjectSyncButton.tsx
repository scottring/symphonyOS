import { useState, useCallback } from 'react'
import type { Project } from '@/types/project'

interface ProjectSyncButtonProps {
  project: Project
  available: boolean
  syncing: boolean
  isSynced: boolean
  onSync: (project: Project) => Promise<boolean>
}

export function ProjectSyncButton({
  project,
  available,
  syncing,
  isSynced,
  onSync,
}: ProjectSyncButtonProps) {
  const [justSynced, setJustSynced] = useState(false)

  const handleSync = useCallback(async () => {
    const success = await onSync(project)
    if (success) {
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 3000)
    }
  }, [project, onSync])

  if (!available) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-400 bg-neutral-50 rounded-lg border border-neutral-100">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
        Vault offline
      </span>
    )
  }

  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg border border-blue-100">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
        </svg>
        Syncing...
      </span>
    )
  }

  if (isSynced || justSynced) {
    return (
      <button
        onClick={handleSync}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg border border-green-100 hover:bg-green-100 transition-colors"
        title="Re-sync to vault"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Synced
      </button>
    )
  }

  return (
    <button
      onClick={handleSync}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded-lg border border-primary-100 hover:bg-primary-100 transition-colors"
      title="Sync project to Open Brain vault"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
      </svg>
      Sync to Vault
    </button>
  )
}
