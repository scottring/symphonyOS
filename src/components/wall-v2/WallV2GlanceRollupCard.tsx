// src/components/wall-v2/WallV2GlanceRollupCard.tsx
// "At a glance" — day rollup rows with lucide icons mapped from semantic keys.

import { CalendarDays, CircleCheckBig, House, UtensilsCrossed } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WALL } from './wallTheme';
import type { GlanceRollupRow } from './wallV2Rollups';

const ICONS: Record<GlanceRollupRow['icon'], LucideIcon> = {
  calendar: CalendarDays, tasks: CircleCheckBig, dinner: UtensilsCrossed, home: House,
};

export function WallV2GlanceRollupCard({ rows }: { rows: GlanceRollupRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={`${WALL.card} px-4 py-3`}>
      <div className={WALL.label}>At a glance</div>
      <div className="mt-1.5">
        {rows.map((r) => {
          const Icon = ICONS[r.icon];
          return (
            <div key={r.id} className={`flex items-center gap-2.5 py-1 text-[0.9rem] ${WALL.ink}`}>
              <Icon className={`w-4 h-4 shrink-0 ${WALL.muted}`} />
              <span className="truncate">{r.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
