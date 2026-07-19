// src/components/wall-v2/WallV2TomorrowCard.tsx
// Tomorrow-morning preview: up to 3 rows, time in honey, hidden when empty.

import { Sunrise } from 'lucide-react';
import { WALL } from './wallTheme';

interface Props { rows: { id: string; time: string; title: string }[] }

export function WallV2TomorrowCard({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <div className={`${WALL.card} px-4 py-3`}>
      <div className={`flex items-center gap-1.5 ${WALL.label}`}>
        <Sunrise className="w-3.5 h-3.5" /> Tomorrow morning
      </div>
      <div className="mt-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex gap-2.5 py-1 text-[0.9rem]">
            <span className="w-10 shrink-0 font-bold text-[0.8rem] text-[#A8743F] dark:text-[#D8BC85] tabular-nums">{r.time}</span>
            <span className={`truncate ${WALL.ink}`}>{r.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
