// Always-visible freshness line for the kiosk rail.
//
// Deliberately rendered even when everything is healthy: the wall's failure mode
// is looking authoritative while hours out of date, so "no warning showing" must
// never be the only evidence that the data is current.

import { AlertTriangle } from 'lucide-react';
import { WALL } from './wallTheme';
import type { Freshness } from './wallFreshness';

interface Props {
  freshness: Freshness;
}

export function WallV2FreshnessLine({ freshness }: Props) {
  const warning = freshness.level !== 'fresh';

  return (
    <div
      data-testid="wall-freshness"
      data-level={freshness.level}
      className={`mt-3 flex items-center gap-1.5 text-[0.75rem] ${
        warning ? `${WALL.warn} font-bold` : WALL.muted
      }`}
    >
      {warning && <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />}
      <span>{freshness.label}</span>
    </div>
  );
}
