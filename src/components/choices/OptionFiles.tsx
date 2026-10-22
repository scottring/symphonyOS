import { useCallback, useState } from 'react'
import { FileUpload, AttachmentList } from '@/components/attachments'
import type { Attachment } from '@/types/attachment'
import type { ChoiceOption } from '@/types/choice'
import { DialogFrame, quietButton } from './DialogFrame'
import type { OptionFilesApi } from './useOptionFiles'

/** The Files cell: file names as links. */
export function FilesCell({ files, onOpen }: { files: readonly Attachment[]; onOpen: (a: Attachment) => void }) {
  return (
    <span className="flex flex-col gap-0.5">
      {files.map((f) => (
        <button key={f.id} type="button" onClick={() => onOpen(f)}
          className="max-w-[180px] truncate text-left text-[13px] text-primary-600 underline-offset-2 hover:underline">
          {f.fileName}
        </button>
      ))}
    </span>
  )
}

/** An option's files: the list, and a place to add one. Adding is a write
 *  with Undo (removing the file again). */
export function FilesDialog({ option, api, onUpload, onClose }: {
  option: ChoiceOption
  api: OptionFilesApi
  onUpload: (o: ChoiceOption, file: File) => Promise<boolean>
  onClose: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const files = api.filesOf(option.id)
  const upload = useCallback(async (file: File) => {
    setUploading(true); setError(null)
    if (!(await onUpload(option, file))) setError('Upload failed — try again.')
    setUploading(false)
  }, [onUpload, option])
  return (
    <DialogFrame title={`Files · ${option.name}`} onClose={onClose}>
      {files.length > 0 && (
        <div className="mb-2">
          <AttachmentList attachments={files} onDelete={(a) => void api.remove(a)} onOpen={api.open} />
        </div>
      )}
      <FileUpload onFileSelect={(f) => void upload(f)} isUploading={uploading} error={error} compact={files.length > 0} />
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onClose} className={quietButton}>Done</button>
      </div>
    </DialogFrame>
  )
}
