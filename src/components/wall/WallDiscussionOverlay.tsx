import { MessageCircle, X, Check, Calendar } from 'lucide-react'
import type { DiscussionItem } from '@/hooks/useFamilyDiscussionItems'

interface WallDiscussionOverlayProps {
  items: DiscussionItem[]
  onMarkDiscussed: (item: DiscussionItem) => void
  onClose: () => void
}

export function WallDiscussionOverlay({ items, onMarkDiscussed, onClose }: WallDiscussionOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-10"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 text-white rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-6 h-6 text-amber-300" />
            <h2 className="font-display text-2xl">For Discussion</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-3 rounded-lg hover:bg-white/10"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {items.length === 0 && (
            <p className="text-white/40 text-center py-8">Nothing to discuss right now.</p>
          )}
          {items.map((item) => (
            <div
              key={`${item.kind}:${item.id}`}
              className="flex items-start gap-4 bg-white/5 hover:bg-white/10 rounded-xl p-4 transition-colors"
            >
              <div className="flex-shrink-0 mt-1 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                {item.kind === 'event' ? <Calendar className="w-5 h-5 text-blue-300" /> : <Check className="w-5 h-5 text-emerald-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-xl leading-tight">{item.title}</div>
                {item.note && (
                  <p className="mt-2 italic text-white/70 text-base">{item.note}</p>
                )}
              </div>
              <button
                onClick={() => onMarkDiscussed(item)}
                aria-label="Mark as discussed"
                className="flex-shrink-0 px-5 py-3 min-h-[48px] bg-amber-300 text-neutral-900 font-bold rounded-lg hover:bg-amber-400 active:bg-amber-500"
              >
                Mark as discussed
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
