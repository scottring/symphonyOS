import { CornerRightDown, Archive, Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'

export function OverflowTray({ items, onMakeMove, onShelf, onLetGo }: {
  items: readonly Task[]
  onMakeMove: (id: string) => void
  onShelf: (id: string) => void
  onLetGo: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="mt-6 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4">
      <h3 className="text-sm font-medium text-neutral-600">These aren't bets yet ({items.length})</h3>
      <p className="text-[12px] text-neutral-400 mt-0.5 mb-3">
        A season holds 5–8 bets. These are load — turn them into moves, shelf them, or let them go.
      </p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-lg bg-white border border-neutral-100 px-3 py-2">
            <span className="flex-1 min-w-0 text-sm text-neutral-700 truncate">{t.title}</span>
            <button type="button" onClick={() => onMakeMove(t.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <CornerRightDown className="w-3 h-3" /> Month move
            </button>
            <button type="button" onClick={() => onShelf(t.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors">
              <Archive className="w-3 h-3" /> Shelf
            </button>
            <button type="button" onClick={() => onLetGo(t.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
              <Trash2 className="w-3 h-3" /> Let it go
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
