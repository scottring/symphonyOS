// src/apps/wall/index.ts
import type { AppDef } from '@/shell/types';
import { WallApp } from './WallApp';

export const wallAppDef: AppDef = {
  id: 'wall',
  route: '/wall',
  Component: WallApp,
  // Wall doesn't claim selection kinds in v1 — its detail interactions
  // happen inline within the wall surface itself.
};
