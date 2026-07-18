// src/apps/wall-v2/WallV2App.tsx
// Parallel kiosk surface — cream/Nordic Journal redesign of /wall.
// Lives next to WallApp; chromeless, fetches its own data via WallV2Shell.

import { WallV2Shell } from '@/components/wall-v2/WallV2Shell';

export function WallV2App() {
  return <WallV2Shell />;
}
