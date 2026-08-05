import { FileBadge } from 'lucide-react'
import { documentKindLabel, type DocumentKind } from '@/types/document'

interface Props {
  kind: DocumentKind
  label: string
  onKeep: () => void
  onDismiss: () => void
}

/** One binary decision: is this a document worth keeping? Editing its label,
 *  owner, and expiry happens on the shelf, not here. */
export function DocumentProposalRow({ kind, label, onKeep, onDismiss }: Props) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-lg bg-primary-50/50 shadow-[inset_0_0_0_1px_#c9dcc9]">
      <FileBadge className="w-4 h-4 shrink-0 text-primary-600" />
      {/* Label leads. Two proposals of the same kind (a licence front and back)
          would otherwise render as two identical-looking rows. */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-800 truncate">{label}</div>
        <div className="text-[12px] text-neutral-500 truncate">
          Looks like a {documentKindLabel(kind).toLowerCase()}
        </div>
      </div>
      <button
        onClick={onKeep}
        className="text-[12px] font-medium text-primary-700 hover:text-primary-800 whitespace-nowrap"
      >
        Keep in Documents
      </button>
      <button
        onClick={onDismiss}
        className="text-[12px] text-neutral-500 hover:text-neutral-700 whitespace-nowrap"
      >
        Not a document
      </button>
    </div>
  )
}
