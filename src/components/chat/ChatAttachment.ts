import { supabase } from '@/lib/supabase'

export interface ChatAttachment {
  url: string
  fileType: string
  fileName: string
}

export async function uploadChatFile(file: File, userId: string): Promise<ChatAttachment> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/chat/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data, error: signErr } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 3600)
  if (signErr || !data) throw signErr ?? new Error('Could not sign url')
  return { url: data.signedUrl, fileType: file.type, fileName: file.name }
}
