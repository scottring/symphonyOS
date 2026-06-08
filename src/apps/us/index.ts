import type { AppDef } from '@/shell/types';
import { Heart } from 'lucide-react';
import { UsApp } from './UsApp';

// Phase 4 — the "Us" couple surface in the Library. Distinct from the household
// wall by the scope tag (couple/compound), not a separate member set (Option A).
export const usAppDef: AppDef = {
  id: 'us',
  route: '/us',
  sidebar: { label: 'Us', icon: Heart, order: 5 },
  Component: UsApp,
};
