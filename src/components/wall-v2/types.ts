// src/components/wall-v2/types.ts
//
// Shared types for the WallV2 surface. These are intentionally view-shaped
// (already formatted, color-coded, presentation-ready) so the static mock
// and the real-data wiring in WallV2Shell can share the exact same render path.

import type { LucideIcon } from 'lucide-react';

/** A pastel color preset used to tint icon chips and avatars. */
export type WallV2Tint =
  | 'sage'
  | 'sky'
  | 'lavender'
  | 'peach'
  | 'honey'
  | 'rose'
  | 'sand'
  | 'mint';

/** A single "AT A GLANCE" card — one signal per person/topic at the top. */
export interface WallV2GlanceCard {
  id: string;
  icon: LucideIcon;
  tint: WallV2Tint;
  /** Top line — usually a person's name or the topic. */
  title: string;
  /** Middle line — the situation. */
  primary: string;
  /** Bottom line — a small qualifier (time, instruction, count). */
  secondary?: string;
}

/** Avatar bubble shown next to family-shared timeline items. */
export interface WallV2MemberBubble {
  id: string;
  initials: string;
  /** Tailwind-style background hue token from our pastel set. */
  tint: WallV2Tint;
}

/** A small chip next to a timeline event (streak count, owner badge, etc.). */
export interface WallV2EventChip {
  icon?: LucideIcon;
  label: string;
  tint?: WallV2Tint;
}

/** A single event card inside a timeline section. */
export interface WallV2TimelineEvent {
  id: string;
  icon: LucideIcon;
  tint: WallV2Tint;
  title: string;
  /** First subtitle line (category / location / route). */
  subtitle?: string;
  /** Trailing meta on the same line as subtitle ("60 min", "~20 min"). */
  meta?: string;
  /** Smaller third line (e.g. "Serves 4 · Medium prep"). */
  detail?: string;
  members?: WallV2MemberBubble[];
  chips?: WallV2EventChip[];
  /** Soft tinted background for highlighted rows (e.g. family dinner). */
  highlight?: WallV2Tint;
  /** Truthy when the card should render a recipe-viewer chevron. */
  recipeUrl?: string | null;
  /** Completion state (drives the touch checkbox on the wall). */
  completed?: boolean;
}

/** A labeled grouping of events — Afternoon / Evening / Night. */
export interface WallV2TimelineSection {
  id: 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  icon: LucideIcon;
  tint: WallV2Tint;
  events: WallV2TimelineEvent[];
}

/** Weather-card payload (right column + hero). */
export interface WallV2WeatherData {
  temp: number;
  high: number;
  low: number;
  condition: string;
  rainChance: number;
  /** Optional natural-language line ("Sunny all day. Nice evening."). */
  sentence?: string;
  icon: LucideIcon;
}

/** A row in the UPCOMING widget. */
export interface WallV2UpcomingItem {
  id: string;
  label: string;
  detail: string;
  tint: WallV2Tint;
}

/** Grocery-card payload. */
export interface WallV2GroceryData {
  count: number;
  items: string[];
}

/** AI Insight card payload. */
export interface WallV2InsightData {
  body: string;
  cta?: string;
  /** Internal href for the CTA — leave undefined to render as static text. */
  href?: string;
}

/** Single action-dock button. */
export interface WallV2ActionDef {
  id: string;
  label: string;
  caption: string;
  icon: LucideIcon;
  tint: WallV2Tint;
}
