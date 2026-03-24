import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface VaultWriteResult {
  success: boolean
  noteId: string | null
  vaultPath: string
  commitSha: string
  githubUrl: string
}

interface CreateVaultNoteData {
  title: string
  content: string
  domain?: string
  path?: string
}

export function useVaultWrite() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callEdgeFunction = useCallback(
    async (body: Record<string, unknown>): Promise<VaultWriteResult | null> => {
      if (!user) {
        setError('Not authenticated')
        return null
      }

      setLoading(true)
      setError(null)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setError('No active session')
          return null
        }

        const { data, error: fnError } = await supabase.functions.invoke('vault-write', {
          body,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        if (fnError) {
          setError(fnError.message)
          return null
        }

        if (data?.error) {
          setError(data.error)
          return null
        }

        return data as VaultWriteResult
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to write to vault'
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [user],
  )

  const pushToVault = useCallback(
    async (noteId: string, commitMessage?: string): Promise<VaultWriteResult | null> => {
      return callEdgeFunction({ noteId, commitMessage })
    },
    [callEdgeFunction],
  )

  const createVaultNote = useCallback(
    async (data: CreateVaultNoteData, commitMessage?: string): Promise<VaultWriteResult | null> => {
      return callEdgeFunction({
        title: data.title,
        content: data.content,
        domain: data.domain,
        vaultPath: data.path,
        commitMessage,
      })
    },
    [callEdgeFunction],
  )

  return {
    pushToVault,
    createVaultNote,
    loading,
    error,
  }
}
