// src/components/wall-v2/tints.ts
//
// Pastel-tint palette for icon chips, avatars, dots, etc. Kept centralized so
// the look stays consistent across cards. Backgrounds are warm and soft to sit
// well on the Nordic-Journal cream canvas; foregrounds are saturated enough to
// register from 6+ feet away.

import type { WallV2Tint } from './types';

interface TintStyle {
  /** Background for icon chips (rounded square behind the icon). */
  bg: string;
  /** Foreground for the icon itself. */
  fg: string;
  /** Soft tinted background used for highlight rows. */
  soft: string;
  /** Solid-dot color for upcoming/timeline dots. */
  dot: string;
}

export const TINTS: Record<WallV2Tint, TintStyle> = {
  sage: {
    bg: 'bg-emerald-50',
    fg: 'text-emerald-700',
    soft: 'bg-emerald-50/60',
    dot: 'bg-emerald-500',
  },
  sky: {
    bg: 'bg-sky-50',
    fg: 'text-sky-700',
    soft: 'bg-sky-50/60',
    dot: 'bg-sky-500',
  },
  lavender: {
    bg: 'bg-violet-50',
    fg: 'text-violet-700',
    soft: 'bg-violet-50/70',
    dot: 'bg-violet-500',
  },
  peach: {
    bg: 'bg-orange-50',
    fg: 'text-orange-700',
    soft: 'bg-orange-50/70',
    dot: 'bg-orange-500',
  },
  honey: {
    bg: 'bg-amber-50',
    fg: 'text-amber-700',
    soft: 'bg-amber-50/70',
    dot: 'bg-amber-500',
  },
  rose: {
    bg: 'bg-rose-50',
    fg: 'text-rose-700',
    soft: 'bg-rose-50/70',
    dot: 'bg-rose-500',
  },
  sand: {
    bg: 'bg-stone-100',
    fg: 'text-stone-700',
    soft: 'bg-stone-50',
    dot: 'bg-stone-500',
  },
  mint: {
    bg: 'bg-teal-50',
    fg: 'text-teal-700',
    soft: 'bg-teal-50/60',
    dot: 'bg-teal-500',
  },
};
