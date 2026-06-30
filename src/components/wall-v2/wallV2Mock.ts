// src/components/wall-v2/wallV2Mock.ts
//
// Static mockup payload mirroring the source screenshot. Lives alongside the
// view components so we can render a pixel-faithful preview without any
// Supabase wiring. Task #3 swaps this for live data via useWallData.

import {
  Backpack, Bath, Calendar, Phone, Car, Check, MessageCircle,
  Moon, Plus, ShoppingBag, ShoppingCart, Sun, Trophy, Users,
  UtensilsCrossed, Flame, Sunrise,
} from 'lucide-react';

import type {
  WallV2ActionDef,
  WallV2GlanceCard,
  WallV2GroceryData,
  WallV2InsightData,
  WallV2TimelineSection,
  WallV2UpcomingItem,
  WallV2WeatherData,
} from './types';

export const MOCK_TAGLINE = 'Take care of each other. You’ve got this.';

export const MOCK_GLANCE: WallV2GlanceCard[] = [
  {
    id: 'ella',
    icon: Backpack,
    tint: 'sage',
    title: 'Ella',
    primary: 'Field trip today',
    secondary: 'Bring lunch',
  },
  {
    id: 'kaleb',
    icon: Trophy,
    tint: 'sky',
    title: 'Kaleb',
    primary: 'Soccer practice',
    secondary: '5:00 PM',
  },
  {
    id: 'iris',
    icon: Users,
    tint: 'lavender',
    title: 'Iris',
    primary: 'Home at',
    secondary: '6:15 PM',
  },
  {
    id: 'pantry',
    icon: ShoppingBag,
    tint: 'peach',
    title: '2 items missing',
    primary: 'For dinner',
  },
];

export const MOCK_TIMELINE: WallV2TimelineSection[] = [
  {
    id: 'afternoon',
    label: 'Afternoon',
    icon: Sun,
    tint: 'honey',
    events: [
      {
        id: 'caitlin',
        icon: Calendar,
        tint: 'sage',
        title: 'Caitlin appointment',
        subtitle: 'Therapy',
        meta: '60 min',
      },
      {
        id: 'pickup',
        icon: Car,
        tint: 'peach',
        title: 'Pick up Kaleb from FFG',
        subtitle: 'Errand',
        meta: '~20 min',
        chips: [
          { label: 'K', tint: 'sage' },
          { label: 'S', tint: 'sky' },
        ],
      },
    ],
  },
  {
    id: 'evening',
    label: 'Evening',
    icon: Moon,
    tint: 'lavender',
    events: [
      {
        id: 'dinner',
        icon: UtensilsCrossed,
        tint: 'peach',
        title: 'Family dinner',
        subtitle: 'Crispy tofu stir fry',
        detail: 'Serves 4  ·  Medium prep',
        highlight: 'peach',
        members: [
          { id: 's', initials: 'S', tint: 'sage' },
          { id: 'i', initials: 'I', tint: 'lavender' },
          { id: 'k', initials: 'K', tint: 'sky' },
          { id: 'e', initials: 'E', tint: 'rose' },
        ],
        recipeUrl: 'https://example.com/crispy-tofu',
      },
      {
        id: 'shower',
        icon: Bath,
        tint: 'sky',
        title: 'Kids shower routine',
        subtitle: 'Routine',
        meta: '~15 min',
        chips: [
          { icon: Flame, label: '3', tint: 'peach' },
          { label: 'IR', tint: 'sand' },
        ],
      },
    ],
  },
  {
    id: 'night',
    label: 'Night',
    icon: Moon,
    tint: 'sand',
    events: [
      {
        id: 'winddown',
        icon: Sunrise,
        tint: 'lavender',
        title: 'Wind down',
        subtitle: 'Reading + prep for tomorrow',
      },
    ],
  },
];

export const MOCK_WEATHER: WallV2WeatherData = {
  temp: 72,
  high: 94,
  low: 70,
  condition: 'Sunny',
  rainChance: 10,
  sentence: 'Sunny all day. Nice evening.',
  icon: Sun,
};

export const MOCK_GROCERY: WallV2GroceryData = {
  count: 2,
  items: ['Snap peas', 'Brown rice'],
};

export const MOCK_UPCOMING: WallV2UpcomingItem[] = [
  {
    id: 'tomorrow',
    label: 'Tomorrow',
    detail: 'Early release 1:15 PM',
    tint: 'sage',
  },
  {
    id: 'friday',
    label: 'Friday',
    detail: 'Ella’s field trip',
    tint: 'honey',
  },
];

export const MOCK_INSIGHT: WallV2InsightData = {
  body: 'Thursday looks perfect for backyard upgrades. Should we plan to start in the morning?',
  cta: 'View weekend plan',
};

export const MOCK_ACTIONS: WallV2ActionDef[] = [
  { id: 'reminder', label: 'Add reminder', caption: 'Everyone will see', icon: Plus, tint: 'sage' },
  { id: 'grocery', label: 'Add grocery item', caption: 'Update the list', icon: ShoppingCart, tint: 'peach' },
  { id: 'task', label: 'Add task', caption: 'For today or later', icon: Check, tint: 'sky' },
  { id: 'discuss', label: 'Need to discuss', caption: 'Open a conversation', icon: MessageCircle, tint: 'lavender' },
  { id: 'event', label: 'Add event', caption: 'On the calendar', icon: Calendar, tint: 'rose' },
  { id: 'phone', label: 'Call someone', caption: 'Ring the phone', icon: Phone, tint: 'mint' },
];
