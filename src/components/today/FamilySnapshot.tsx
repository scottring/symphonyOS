import type { FamilyMemberSummary } from '@/lib/familySnapshot'

interface FamilySnapshotProps {
  members: FamilyMemberSummary[]
  /** Open per-member detail (currently navigates to the Family view). */
  onSelectMember: (id: string) => void
  /** Open the full family view. */
  onViewAll: () => void
}

/**
 * Right-rail "Family snapshot" panel. One row per core family member with
 * their initial bubble, name, role label, and open-task count. Hides
 * entirely when there are no core members (avoids noise for solo users).
 */
export function FamilySnapshot({ members, onSelectMember, onViewAll }: FamilySnapshotProps) {
  if (members.length === 0) return null

  return (
    <section
      aria-labelledby="rail-family-snapshot"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-family-snapshot"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Family snapshot
      </h2>

      <ul className="space-y-2.5">
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelectMember(m.id)}
              className="w-full flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-md px-1 -mx-1 py-1"
              aria-label={m.name}
            >
              <span
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor: `color-mix(in srgb, ${colorVar(m.color)} 18%, white)`,
                  color: colorVar(m.color),
                }}
                aria-hidden
              >
                {m.initials}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[13px] text-neutral-800 truncate leading-tight group-hover:text-neutral-900">
                  {m.name}
                </p>
                {m.roleLabel && (
                  <p className="text-[11px] text-neutral-400 truncate leading-tight capitalize">
                    {m.roleLabel}
                  </p>
                )}
              </div>
              {m.openTaskCount > 0 && (
                <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">
                  {m.openTaskCount} open
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onViewAll}
        className="
          mt-4 w-full text-center text-[13px] font-medium
          text-primary-700 hover:text-primary-800
          py-1.5 rounded-md hover:bg-primary-50 transition-colors
        "
      >
        See all
      </button>
    </section>
  )
}

/**
 * Resolves the small color-name vocabulary used on FamilyMember to a CSS color.
 * Keeps the rail panel decoupled from any global theme constant — the same
 * mapping is used elsewhere in the app for member avatars.
 */
function colorVar(name: string): string {
  switch (name) {
    case 'blue': return 'hsl(217 91% 60%)'
    case 'purple': return 'hsl(271 81% 56%)'
    case 'green': return 'hsl(142 71% 45%)'
    case 'orange': return 'hsl(25 95% 53%)'
    case 'pink': return 'hsl(330 81% 60%)'
    case 'teal': return 'hsl(168 76% 42%)'
    default: return 'hsl(168 45% 30%)' // primary fallback
  }
}
