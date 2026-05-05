// src/apps/wall/WallApp.tsx
// Thin wrapper around the existing wall implementation.
// Renders the same component tree currently used in main.tsx for /wall,
// but as a self-contained app that fetches its own data via existing hooks.
//
// WallCalendar is fully self-contained: it takes no props, runs its own
// auth check via useAuth(), and fetches its own data via useWallData() and
// related hooks. The only required wrapper is GeneratePlanProvider (which
// the legacy main.tsx mount also provided).

import { GeneratePlanProvider } from '@/contexts/GeneratePlanContext';
import { WallCalendar } from '@/components/wall/WallCalendar';

export function WallApp() {
  return (
    <GeneratePlanProvider>
      <WallCalendar />
    </GeneratePlanProvider>
  );
}
