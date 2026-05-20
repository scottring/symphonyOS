// src/apps/wall/WallApp.tsx
//
// Kitchen kiosk surface. As of the WallV2 ship, /wall renders the cream
// Nordic-Journal design (WallV2Shell). The dark-mode WallCalendar code
// remains in `src/components/wall/` for rollback and reference — none of
// it is mounted by default anymore.
//
// The /wall-v2 alias points at the same component (see src/apps/wall-v2)
// so existing bookmarks keep working.

import { GeneratePlanProvider } from '@/contexts/GeneratePlanContext';
import { WallV2Shell } from '@/components/wall-v2/WallV2Shell';

export function WallApp() {
  return (
    <GeneratePlanProvider>
      <WallV2Shell />
    </GeneratePlanProvider>
  );
}
