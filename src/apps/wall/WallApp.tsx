// src/apps/wall/WallApp.tsx
//
// Kitchen kiosk surface. Currently mounts the legacy WallCalendar (the
// dark-mode design). The new cream/Nordic-Journal design (WallV2Shell)
// is still available at /wall-v2 for iteration — flip the import below
// when ready to promote it back to /wall.

import { WallCalendar } from '@/components/wall/WallCalendar';

export function WallApp() {
  return <WallCalendar />;
}
