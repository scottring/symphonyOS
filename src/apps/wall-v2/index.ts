// src/apps/wall-v2/index.ts
import type { AppDef } from '@/shell/types';
import { WallV2App } from './WallV2App';

export const wallV2AppDef: AppDef = {
  id: 'wall-v2',
  route: '/wall-v2',
  Component: WallV2App,
  // Same chromeless contract as /wall — kiosk surface owns the whole viewport.
  chromeless: true,
};
