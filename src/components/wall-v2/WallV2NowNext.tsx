// WallV2NowNext — the staging-aware focal point of the Execution Wall.
//
// Derives "Happening now" and "Next up" from today's timed items against the
// clock, and renders each item's already-staged materials as large touch tiles.
// This is where Symphony's promise pays off on the wall: the number / link /
// recipe / steps are already here, no hunting. Renders nothing when the day has
// no current or upcoming timed item, so it never clutters an empty wall.
//
// Materials are derived from item fields only (no contact fetch) to keep the
// wall's always-on egress flat. The call tile becomes a real placed call in
// Phase 4 (kid-phone bridge); today it's a tel: link (works on a phone).

import { useCallback, useMemo } from 'react'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { TIMED_SECTIONS } from '@/lib/timeUtils'
import type { Material } from '@/types/material'
import { deriveMaterials } from '@/components/surface/hooks/useStagedMaterials'
import { MaterialChip } from '@/components/surface/MaterialChip'
import { placeCall } from '@/lib/telephony/placeCall'
import { WALL } from './wallTheme'

const DEFAULT_DURATION_MS = 60 * 60 * 1000

interface WallV2NowNextProps {
  today: WallDayData | undefined
  familyMembers: FamilyMember[]
  now: Date
  onTapMaterial?: (m: Material, item: TimelineItem) => void
}

function timeToken(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function WallV2NowNext({ today, familyMembers, now, onTapMaterial }: WallV2NowNextProps) {
  const { current, next } = useMemo(() => {
    const timed = TIMED_SECTIONS
      .flatMap((s) => today?.items[s] ?? [])
      .filter((i): i is TimelineItem & { startTime: Date } => !!i.startTime && !i.completed)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    const nowMs = now.getTime()
    let cur: TimelineItem | undefined
    let nxt: TimelineItem | undefined
    for (const it of timed) {
      const s = it.startTime!.getTime()
      const e = it.endTime?.getTime() ?? s + DEFAULT_DURATION_MS
      if (s <= nowMs && nowMs < e) cur = it
      else if (s > nowMs && !nxt) nxt = it
    }
    return { current: cur, next: nxt }
  }, [today, now])

  // On the wall, a call tile places the call through Symphony (tel: is dead on a
  // TV). No-ops gracefully until the kid-phone bridge is provisioned (Phase 4).
  const handleMaterial = useCallback((m: Material, item: TimelineItem) => {
    if (m.action.kind === 'call' && m.action.value) { void placeCall({ toNumber: m.action.value, source: 'kiosk' }); return }
    onTapMaterial?.(m, item)
  }, [onTapMaterial])

  if (!current && !next) return null

  const ownerName = (item: TimelineItem) =>
    item.assignedTo ? familyMembers.find((m) => m.id === item.assignedTo)?.name : undefined

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <section className={`${WALL.card} ${WALL.nowAccent} p-6`}>
          <div className={WALL.label}>
            Happening now{current.startTime ? ` · ${timeToken(current.startTime)}` : ''}
          </div>
          {ownerName(current) && (
            <div className={`mt-1 text-base ${WALL.muted}`}>{ownerName(current)}</div>
          )}
          <h2 className={`mt-1 text-3xl font-semibold leading-tight ${WALL.inkStrong}`}>{current.title}</h2>
          <MaterialRow item={current} variant="tile" onTap={handleMaterial} />
        </section>
      )}

      {next && (
        <section className={`${WALL.card} p-5`}>
          <div className={WALL.label}>
            Next up{next.startTime ? ` · ${timeToken(next.startTime)}` : ''}
          </div>
          {ownerName(next) && <div className={`mt-0.5 text-sm ${WALL.muted}`}>{ownerName(next)}</div>}
          <h3 className={`mt-0.5 text-2xl font-semibold leading-tight ${WALL.inkStrong}`}>{next.title}</h3>
          <MaterialRow item={next} variant="chip" onTap={handleMaterial} />
        </section>
      )}
    </div>
  )
}

/** Render an item's staged materials, or nothing when there are none. */
function MaterialRow({
  item, variant, onTap,
}: { item: TimelineItem; variant: 'chip' | 'tile'; onTap?: (m: Material, item: TimelineItem) => void }) {
  const materials = useMemo(() => deriveMaterials(item), [item])
  if (materials.length === 0) return null
  return (
    <div className={`mt-4 ${variant === 'tile' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}`}>
      {materials.map((m) => (
        <MaterialChip key={m.id} material={m} variant={variant} callAsAction onAction={(mat) => onTap?.(mat, item)} />
      ))}
    </div>
  )
}
