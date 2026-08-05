import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DocumentKind, DocumentScope, DocumentStatus } from '@/types/document'

/** How far ahead an expiry starts mattering — used by the shelf's warning
 *  styling and mirrored by the proactive-engine expiry rule. */
export const EXPIRY_WARNING_DAYS = 60

const MS_PER_DAY = 86_400_000

/** Whole days from today to `expiresOn`. Negative once past. Null when absent.
 *  Both sides are floored to UTC midnight so the result never depends on the
 *  time of day the function happens to be called. */
export function daysUntil(expiresOn: string | null, today: Date = new Date()): number | null {
  if (!expiresOn) return null
  const then = Date.parse(`${expiresOn}T00:00:00Z`)
  if (Number.isNaN(then)) return null
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((then - now) / MS_PER_DAY)
}

export interface SymphonyDocument {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
  kind: DocumentKind
  label: string
  owner: string | null
  expiresOn: string | null
  scope: DocumentScope
  status: DocumentStatus
  /** Where the file was originally attached; null for direct shelf uploads. */
  sourceEntityType: string | null
  sourceEntityId: string | null
  createdAt: Date
}

interface DbRow {
  id: string
  entity_type: string
  entity_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  document_status: string
  document_kind: string
  document_label: string | null
  document_owner: string | null
  document_expires_on: string | null
  document_scope: string
  created_at: string
}

function toDocument(row: DbRow): SymphonyDocument {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    kind: row.document_kind as DocumentKind,
    label: row.document_label ?? row.file_name,
    owner: row.document_owner,
    expiresOn: row.document_expires_on,
    scope: row.document_scope as DocumentScope,
    status: row.document_status as DocumentStatus,
    sourceEntityType: row.entity_type === 'document' ? null : row.entity_type,
    sourceEntityId: row.entity_type === 'document' ? null : row.entity_id,
    createdAt: new Date(row.created_at),
  }
}

const COLUMNS =
  'id, entity_type, entity_id, file_name, file_type, file_size, storage_path, document_status, document_kind, document_label, document_owner, document_expires_on, document_scope, created_at'

export function useDocuments() {
  const { user } = useAuth()
  // Key off the id, not the object: an auth hook that returns a fresh `user`
  // object each render would otherwise re-create `reload` every render and
  // spin the effect below forever.
  const userId = user?.id
  const [rows, setRows] = useState<SymphonyDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('attachments')
      .select(COLUMNS)
      .eq('user_id', userId)
      .in('document_status', ['kept', 'proposed'])
      .order('created_at', { ascending: false })
    setIsLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    setRows(((data ?? []) as unknown as DbRow[]).map(toDocument))
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const patch = useCallback(
    async (id: string, values: Record<string, unknown>): Promise<boolean> => {
      const { error: err } = await supabase.from('attachments').update(values).eq('id', id)
      if (err) {
        setError(err.message)
        await reload()
        return false
      }
      await reload()
      return true
    },
    [reload]
  )

  const keepDocument = useCallback((id: string) => patch(id, { document_status: 'kept' }), [patch])
  const dismissDocument = useCallback(
    (id: string) => patch(id, { document_status: 'dismissed' }),
    [patch]
  )
  const setScope = useCallback(
    (id: string, scope: DocumentScope) => patch(id, { document_scope: scope }),
    [patch]
  )
  const updateDocument = useCallback(
    (id: string, values: { label?: string; owner?: string | null; expiresOn?: string | null }) =>
      patch(id, {
        ...(values.label !== undefined ? { document_label: values.label } : {}),
        ...(values.owner !== undefined ? { document_owner: values.owner } : {}),
        ...(values.expiresOn !== undefined ? { document_expires_on: values.expiresOn } : {}),
      }),
    [patch]
  )

  const deleteDocument = useCallback(
    async (doc: SymphonyDocument): Promise<boolean> => {
      setRows((prev) => prev.filter((d) => d.id !== doc.id))
      const { error: storageErr } = await supabase.storage
        .from('attachments')
        .remove([doc.storagePath])
      if (storageErr) {
        setError(storageErr.message)
        await reload()
        return false
      }
      const { error: delErr } = await supabase.from('attachments').delete().eq('id', doc.id)
      if (delErr) {
        setError(delErr.message)
        await reload()
        return false
      }
      return true
    },
    [reload]
  )

  return {
    documents: rows.filter((d) => d.status === 'kept'),
    proposals: rows.filter((d) => d.status === 'proposed'),
    isLoading,
    error,
    keepDocument,
    dismissDocument,
    updateDocument,
    setScope,
    deleteDocument,
    reload,
  }
}
