// src/components/wall-v2/tints.ts
//
// Pastel-tint palette for icon chips, avatars, dots, etc. Kept centralized so
// the look stays consistent across cards. Backgrounds are warm and soft to sit
// well on the Nordic-Journal cream canvas; foregrounds are saturated enough to
// register from 6+ feet away. Each entry pairs a light pastel with a saturated
// dark variant so the wall can toggle between light + dark modes.

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
    bg: 'bg-emerald-50 dark:bg-emerald-900/40',
    fg: 'text-emerald-700 dark:text-emerald-200',
    soft: 'bg-emerald-50/60 dark:bg-emerald-900/20',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-900/40',
    fg: 'text-sky-700 dark:text-sky-200',
    soft: 'bg-sky-50/60 dark:bg-sky-900/20',
    dot: 'bg-sky-500 dark:bg-sky-400',
  },
  lavender: {
    bg: 'bg-violet-50 dark:bg-violet-900/40',
    fg: 'text-violet-700 dark:text-violet-200',
    soft: 'bg-violet-50/70 dark:bg-violet-900/25',
    dot: 'bg-violet-500 dark:bg-violet-400',
  },
  peach: {
    bg: 'bg-orange-50 dark:bg-orange-900/40',
    fg: 'text-orange-700 dark:text-orange-200',
    soft: 'bg-orange-50/70 dark:bg-orange-900/25',
    dot: 'bg-orange-500 dark:bg-orange-400',
  },
  honey: {
    bg: 'bg-amber-50 dark:bg-amber-900/40',
    fg: 'text-amber-700 dark:text-amber-200',
    soft: 'bg-amber-50/70 dark:bg-amber-900/25',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-900/40',
    fg: 'text-rose-700 dark:text-rose-200',
    soft: 'bg-rose-50/70 dark:bg-rose-900/25',
    dot: 'bg-rose-500 dark:bg-rose-400',
  },
  sand: {
    bg: 'bg-stone-100 dark:bg-stone-800/70',
    fg: 'text-stone-700 dark:text-stone-200',
    soft: 'bg-stone-50 dark:bg-stone-800/40',
    dot: 'bg-stone-500 dark:bg-stone-300',
  },
  mint: {
    bg: 'bg-teal-50 dark:bg-teal-900/40',
    fg: 'text-teal-700 dark:text-teal-200',
    soft: 'bg-teal-50/60 dark:bg-teal-900/20',
    dot: 'bg-teal-500 dark:bg-teal-400',
  },
};
