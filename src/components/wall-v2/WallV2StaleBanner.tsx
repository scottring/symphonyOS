// Full-width banner for critically stale wall data.
//
// Sized to read from across the kitchen (~8 feet), because the whole point is to
// be noticed without anyone going looking for it. Only renders at 'critical' — a
// single dropped poll leaves the rail line to do the talking.

import { WifiOff } from 'lucide-react';
import { WALL } from './wallTheme';
import type { Freshness } from './wallFreshness';

interface Props {
  freshness: Freshness;
}

export function WallV2StaleBanner({ freshness }: Props) {
  if (freshness.level !== 'critical') return null;

  return (
    <div
      data-testid="wall-stale-banner"
      role="status"
      className={`${WALL.warnBanner} mb-3 flex items-center justify-center gap-3 rounded-2xl px-5 py-3`}
    >
      <WifiOff className="w-6 h-6 shrink-0" aria-hidden />
      <span className="text-[1.05rem] font-bold">
        Can't reach Symphony — showing information from {stripUpdatedPrefix(freshness.label)}
      </span>
    </div>
  );
}

/** The rail says "Updated 2:14 PM"; the banner reads better as just the time. */
function stripUpdatedPrefix(label: string): string {
  return label.replace(/^Updated /, '');
}
