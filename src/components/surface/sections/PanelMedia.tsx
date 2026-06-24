import { FileText } from 'lucide-react'

interface PanelMediaProps {
  imageUrl?: string | null
  sourceDoc?: { fileName: string; onOpen: () => void }
}

export function PanelMedia({ imageUrl, sourceDoc }: PanelMediaProps) {
  if (!imageUrl && !sourceDoc) return null
  return (
    <div className="space-y-2">
      {imageUrl && (
        <img src={imageUrl} alt="Routine image" className="w-full max-h-64 object-contain rounded-lg" />
      )}
      {sourceDoc && (
        <button
          onClick={sourceDoc.onOpen}
          className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100">
            <FileText className="w-4 h-4 text-sky-700" />
          </span>
          <span className="flex-1 text-sm text-neutral-800 truncate">{sourceDoc.fileName}</span>
        </button>
      )}
    </div>
  )
}
