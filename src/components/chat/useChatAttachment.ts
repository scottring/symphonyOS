// One file waiting to go with the next message: picked, pasted or dropped.
// Shared by ChatInput and the shell's chat pane.

import { useCallback, useState, type ClipboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { isAllowedFileType } from '@/types/attachment'
import { uploadChatFile, type ChatAttachment } from './ChatAttachment'

export function useChatAttachment() {
  const [pending, setPending] = useState<ChatAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // The signed-in person is looked up when a file is picked, so the pane needs
  // no auth provider around it until then.
  const attach = useCallback(async (file: File) => {
    if (!isAllowedFileType(file.type)) return
    setUploadError(null)
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      setPending(await uploadChatFile(file, user.id))
    } catch {
      setUploadError('Could not attach file. Try again.')
    } finally {
      setUploading(false)
    }
  }, [])

  const clear = useCallback(() => { setPending(null); setUploadError(null) }, [])

  // Paste a screenshot (or any image) straight from the clipboard.
  const onPaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          // Clipboard images often arrive unnamed; give them a real filename.
          const named = file.name
            ? file
            : new File([file], `screenshot-${Date.now()}.png`, { type: file.type || 'image/png' })
          void attach(named)
        }
        return
      }
    }
  }, [attach])

  return { pending, uploading, uploadError, attach, clear, onPaste }
}
