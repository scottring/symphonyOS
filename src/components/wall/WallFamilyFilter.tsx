import type { FamilyMember } from '@/types/family'

interface WallFamilyFilterProps {
  members: FamilyMember[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function WallFamilyFilter({ members, selectedId, onSelect }: WallFamilyFilterProps) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {members.map((m) => {
        const active = m.id === selectedId
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            aria-label={m.name}
            onClick={() => onSelect(m.id)}
            className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white
              transition-all ${active ? 'ring-2 ring-white scale-110' : 'opacity-70'}
            `}
            style={{ background: m.color }}
          >
            {m.initials}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={selectedId === null}
        aria-label="ALL"
        onClick={() => onSelect(null)}
        className={`
          h-10 px-3 rounded-full text-[10px] uppercase tracking-wider text-white
          transition-all
          ${selectedId === null ? 'bg-emerald-800 ring-2 ring-white' : 'bg-white/10 opacity-70'}
        `}
      >
        All
      </button>
    </div>
  )
}
