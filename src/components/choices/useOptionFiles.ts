import { useEffect } from 'react'
import { useAttachments } from '@/hooks/useAttachments'
import type { Attachment } from '@/types/attachment'

/** What the page needs to show and add an option's files. */
export interface OptionFilesApi {
  filesOf: (optionId: string) => Attachment[]
  upload: (optionId: string, file: File) => Promise<Attachment | null>
  remove: (a: Attachment) => Promise<boolean>
  open: (a: Attachment) => void
}

const ENTITY = 'choice_option' as const

/** One attachments cache for the page, loaded for every option shown. */
export function useOptionFiles(optionIds: readonly string[]): OptionFilesApi {
  const { getAttachments, fetchAttachments, uploadAttachment, deleteAttachment, getSignedUrl } = useAttachments()
  const key = optionIds.join(',')
  useEffect(() => {
    for (const id of key ? key.split(',') : []) void fetchAttachments(ENTITY, id)
  }, [key, fetchAttachments])
  return {
    filesOf: (id) => getAttachments(ENTITY, id),
    upload: (id, file) => uploadAttachment(ENTITY, id, file),
    remove: deleteAttachment,
    open: (a) => { void getSignedUrl(a.storagePath).then((url) => { if (url) window.open(url, '_blank', 'noopener') }) },
  }
}
