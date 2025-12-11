import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  type Attachment,
  type AttachmentEntityType,
  type DbAttachment,
  dbAttachmentToAttachment,
  generateStoragePath,
  isAllowedFileType,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
} from '@/types/attachment'

interface UseAttachmentsReturn {
  attachments: Map<string, Attachment[]> // keyed by `${entityType}:${entityId}`
  isLoading: boolean
  error: string | null
  uploadAttachment: (
    entityType: AttachmentEntityType,
    entityId: string,
    file: File
  ) => Promise<Attachment | null>
  deleteAttachment: (attachment: Attachment) => Promise<boolean>
  fetchAttachments: (entityType: AttachmentEntityType, entityId: string) => Promise<Attachment[]>
  getAttachments: (entityType: AttachmentEntityType, entityId: string) => Attachment[]
  getSignedUrl: (storagePath: string) => Promise<string | null>
}

function getCacheKey(entityType: AttachmentEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

export function useAttachments(): UseAttachmentsReturn {
  const { user } = useAuth()
  const [attachments, setAttachments] = useState<Map<string, Attachment[]>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use ref for cache lookups to avoid dependency cycle
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  // Fetch attachments for an entity
  const fetchAttachments = useCallback(
    async (entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]> => {
      if (!user) return []

      const cacheKey = getCacheKey(entityType, entityId)

      // Check cache first (use ref to avoid dependency on attachments state)
      const cached = attachmentsRef.current.get(cacheKey)
      if (cached !== undefined) return cached

      setIsLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('attachments')
        .select('*')
        .eq('user_id', user.id)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })

      setIsLoading(false)

      if (fetchError) {
        setError(fetchError.message)
        return []
      }

      const fetched = (data as DbAttachment[]).map(dbAttachmentToAttachment)
      setAttachments((prev) => new Map(prev).set(cacheKey, fetched))
      return fetched
    },
    [user]
  )

  // Get attachments from cache (synchronous)
  const getAttachments = useCallback(
    (entityType: AttachmentEntityType, entityId: string): Attachment[] => {
      const cacheKey = getCacheKey(entityType, entityId)
      return attachments.get(cacheKey) || []
    },
    [attachments]
  )

  // Upload a file and create attachment record
  const uploadAttachment = useCallback(
    async (
      entityType: AttachmentEntityType,
      entityId: string,
      file: File
    ): Promise<Attachment | null> => {
      if (!user) {
        setError('Must be logged in to upload files')
        return null
      }

      // Validate file type
      if (!isAllowedFileType(file.type)) {
        setError(`File type not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`)
        return null
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError('File size exceeds 50MB limit')
        return null
      }

      setIsLoading(true)
      setError(null)

      const cacheKey = getCacheKey(entityType, entityId)
      const storagePath = generateStoragePath(user.id, entityType, entityId, file.name)

      // Optimistic attachment for UI
      const optimisticAttachment: Attachment = {
        id: crypto.randomUUID(),
        entityType,
        entityId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        createdAt: new Date(),
      }

      // Optimistic update
      setAttachments((prev) => {
        const existing = prev.get(cacheKey) || []
        return new Map(prev).set(cacheKey, [optimisticAttachment, ...existing])
      })

      try {
        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          // Rollback optimistic update
          setAttachments((prev) => {
            const existing = prev.get(cacheKey) || []
            return new Map(prev).set(
              cacheKey,
              existing.filter((a) => a.id !== optimisticAttachment.id)
            )
          })
          setError(uploadError.message)
          setIsLoading(false)
          return null
        }

        // Create database record
        const { data, error: insertError } = await supabase
          .from('attachments')
          .insert({
            user_id: user.id,
            entity_type: entityType,
            entity_id: entityId,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: storagePath,
          })
          .select()
          .single()

        if (insertError) {
          // Try to clean up uploaded file
          await supabase.storage.from('attachments').remove([storagePath])
          // Rollback optimistic update
          setAttachments((prev) => {
            const existing = prev.get(cacheKey) || []
            return new Map(prev).set(
              cacheKey,
              existing.filter((a) => a.id !== optimisticAttachment.id)
            )
          })
          setError(insertError.message)
          setIsLoading(false)
          return null
        }

        // Replace optimistic with real data
        const realAttachment = dbAttachmentToAttachment(data as DbAttachment)
        setAttachments((prev) => {
          const existing = prev.get(cacheKey) || []
          return new Map(prev).set(
            cacheKey,
            existing.map((a) => (a.id === optimisticAttachment.id ? realAttachment : a))
          )
        })

        setIsLoading(false)
        return realAttachment
      } catch (err) {
        // Rollback optimistic update
        setAttachments((prev) => {
          const existing = prev.get(cacheKey) || []
          return new Map(prev).set(
            cacheKey,
            existing.filter((a) => a.id !== optimisticAttachment.id)
          )
        })
        setError(err instanceof Error ? err.message : 'Upload failed')
        setIsLoading(false)
        return null
      }
    },
    [user]
  )

  // Delete an attachment
  const deleteAttachment = useCallback(
    async (attachment: Attachment): Promise<boolean> => {
      if (!user) {
        setError('Must be logged in to delete files')
        return false
      }

      const cacheKey = getCacheKey(attachment.entityType, attachment.entityId)

      // Optimistic update
      setAttachments((prev) => {
        const existing = prev.get(cacheKey) || []
        return new Map(prev).set(
          cacheKey,
          existing.filter((a) => a.id !== attachment.id)
        )
      })

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('attachments')
        .remove([attachment.storagePath])

      if (storageError) {
        // Rollback - re-add attachment
        setAttachments((prev) => {
          const existing = prev.get(cacheKey) || []
          return new Map(prev).set(cacheKey, [...existing, attachment])
        })
        setError(storageError.message)
        return false
      }

      // Delete database record
      const { error: deleteError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id)
        .eq('user_id', user.id)

      if (deleteError) {
        // Rollback - re-add attachment (file already deleted, but DB record remains)
        setAttachments((prev) => {
          const existing = prev.get(cacheKey) || []
          return new Map(prev).set(cacheKey, [...existing, attachment])
        })
        setError(deleteError.message)
        return false
      }

      return true
    },
    [user]
  )

  // Get a signed URL for viewing/downloading a file
  const getSignedUrl = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (!user) return null

      const { data, error: signError } = await supabase.storage
        .from('attachments')
        .createSignedUrl(storagePath, 3600) // 1 hour expiry

      if (signError) {
        setError(signError.message)
        return null
      }

      return data.signedUrl
    },
    [user]
  )

  return {
    attachments,
    isLoading,
    error,
    uploadAttachment,
    deleteAttachment,
    fetchAttachments,
    getAttachments,
    getSignedUrl,
  }
}
