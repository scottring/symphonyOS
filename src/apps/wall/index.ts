// src/apps/wall/index.ts
import type { AppDef } from '@/shell/types';
import { WallApp } from './WallApp';

export const wallAppDef: AppDef = {
  id: 'wall',
  route: '/wall',
  Component: WallApp,
  // Wall is a kiosk surface — render full-bleed without Shell chrome
  // (no sidebar, no topbar). The wall surface owns its own layout.
  chromeless: true,
  // Wall doesn't claim selection kinds in v1 — its detail interactions
  // happen inline within the wall surface itself.
};
