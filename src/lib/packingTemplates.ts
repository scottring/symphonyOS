/**
 * Packing List Templates
 * Predefined packing lists for different trip types
 */

import type { PackingItem, PackingTemplate, PackingCategory } from '@/types/trip'

// ============================================================================
// Packing List Templates
// ============================================================================

const WEEKEND_TRIP: PackingItem[] = [
  // Clothing
  { name: 'Outfits (2-3 days)', category: 'clothing', essential: true },
  { name: 'Underwear & socks (3 sets)', category: 'clothing', essential: true },
  { name: 'Pajamas', category: 'clothing', essential: true },
  { name: 'Jacket or sweater', category: 'clothing', essential: false },
  { name: 'Comfortable shoes', category: 'clothing', essential: true },
  { name: 'Extra pair of shoes', category: 'clothing', essential: false },

  // Toiletries
  { name: 'Toothbrush & toothpaste', category: 'toiletries', essential: true },
  { name: 'Deodorant', category: 'toiletries', essential: true },
  { name: 'Shampoo & conditioner', category: 'toiletries', essential: true },
  { name: 'Body wash or soap', category: 'toiletries', essential: true },
  { name: 'Hairbrush or comb', category: 'toiletries', essential: true },
  { name: 'Medications', category: 'toiletries', essential: true },
  { name: 'Sunscreen', category: 'toiletries', essential: false },

  // Electronics
  { name: 'Phone charger', category: 'electronics', essential: true },
  { name: 'Portable battery pack', category: 'electronics', essential: false },
  { name: 'Headphones', category: 'electronics', essential: false },

  // Documents
  { name: 'ID/Driver\'s license', category: 'documents', essential: true },
  { name: 'Credit/debit cards', category: 'documents', essential: true },
  { name: 'Insurance cards', category: 'documents', essential: true },

  // Food & Drinks
  { name: 'Water bottle', category: 'food_drinks', essential: false },
  { name: 'Snacks for travel', category: 'food_drinks', essential: false },
]

const WEEK_LONG_TRIP: PackingItem[] = [
  // Everything from weekend trip
  ...WEEKEND_TRIP.filter(item => item.name !== 'Outfits (2-3 days)'),
  { name: 'Outfits (7-8 days)', category: 'clothing', essential: true },
  { name: 'Underwear & socks (8 sets)', category: 'clothing', essential: true },
  { name: 'Workout clothes', category: 'clothing', essential: false },
  { name: 'Swimsuit', category: 'clothing', essential: false },
  { name: 'Dressy outfit', category: 'clothing', essential: false },

  // Additional electronics
  { name: 'Laptop & charger', category: 'electronics', essential: false },
  { name: 'E-reader or books', category: 'electronics', essential: false },
  { name: 'Camera', category: 'electronics', essential: false },

  // Additional toiletries
  { name: 'Laundry detergent packets', category: 'toiletries', essential: false },
  { name: 'First aid kit', category: 'toiletries', essential: false },
]

const EV_ROAD_TRIP: PackingItem[] = [
  // EV-specific equipment
  { name: 'EV charging adapter (if needed)', category: 'ev_equipment', essential: true },
  { name: 'Charging cable', category: 'ev_equipment', essential: true },
  { name: 'Extension cord (for destination charging)', category: 'ev_equipment', essential: false },
  { name: 'Tire pressure gauge', category: 'ev_equipment', essential: false },
  { name: 'Emergency roadside kit', category: 'ev_equipment', essential: false },

  // Food & Entertainment for longer drives
  { name: 'Cooler with drinks & snacks', category: 'food_drinks', essential: false },
  { name: 'Coffee/tea thermos', category: 'food_drinks', essential: false },
  { name: 'Road trip playlist', category: 'recreation', essential: false },
  { name: 'Audiobooks or podcasts downloaded', category: 'recreation', essential: false },

  // Comfort items
  { name: 'Pillow & blanket', category: 'other', essential: false },
  { name: 'Phone mount for navigation', category: 'electronics', essential: true },
]

const BEACH_TRIP: PackingItem[] = [
  // Beach essentials
  { name: 'Swimsuit', category: 'clothing', essential: true },
  { name: 'Cover-up', category: 'clothing', essential: true },
  { name: 'Flip-flops or sandals', category: 'clothing', essential: true },
  { name: 'Sun hat', category: 'clothing', essential: true },
  { name: 'Sunglasses', category: 'clothing', essential: true },

  // Beach gear
  { name: 'Beach towel', category: 'recreation', essential: true },
  { name: 'Sunscreen (SPF 30+)', category: 'toiletries', essential: true },
  { name: 'After-sun lotion', category: 'toiletries', essential: false },
  { name: 'Beach bag', category: 'other', essential: true },
  { name: 'Beach umbrella or tent', category: 'recreation', essential: false },
  { name: 'Beach chair', category: 'recreation', essential: false },
  { name: 'Snorkel gear', category: 'recreation', essential: false },
  { name: 'Waterproof phone case', category: 'electronics', essential: false },

  // Recreation
  { name: 'Book or e-reader', category: 'recreation', essential: false },
  { name: 'Beach toys/games', category: 'recreation', essential: false },
]

const SKI_TRIP: PackingItem[] = [
  // Ski clothing
  { name: 'Ski jacket', category: 'clothing', essential: true },
  { name: 'Ski pants', category: 'clothing', essential: true },
  { name: 'Base layers (2-3 sets)', category: 'clothing', essential: true },
  { name: 'Wool socks (3-4 pairs)', category: 'clothing', essential: true },
  { name: 'Gloves or mittens', category: 'clothing', essential: true },
  { name: 'Hat or beanie', category: 'clothing', essential: true },
  { name: 'Neck warmer or balaclava', category: 'clothing', essential: true },
  { name: 'Goggles', category: 'clothing', essential: true },

  // Ski gear
  { name: 'Skis/snowboard (if not renting)', category: 'recreation', essential: false },
  { name: 'Ski boots (if not renting)', category: 'recreation', essential: false },
  { name: 'Helmet', category: 'recreation', essential: true },
  { name: 'Hand/toe warmers', category: 'other', essential: false },

  // After-ski
  { name: 'Warm casual clothes', category: 'clothing', essential: true },
  { name: 'Lip balm with SPF', category: 'toiletries', essential: true },
  { name: 'Moisturizer', category: 'toiletries', essential: true },
]

const BUSINESS_TRIP: PackingItem[] = [
  // Professional attire
  { name: 'Business suits/outfits', category: 'clothing', essential: true },
  { name: 'Dress shoes', category: 'clothing', essential: true },
  { name: 'Belt', category: 'clothing', essential: true },
  { name: 'Professional accessories', category: 'clothing', essential: false },

  // Work essentials
  { name: 'Laptop & charger', category: 'electronics', essential: true },
  { name: 'Work documents/files', category: 'documents', essential: true },
  { name: 'Business cards', category: 'documents', essential: true },
  { name: 'Notebook & pen', category: 'other', essential: true },
  { name: 'Phone charger & adapter', category: 'electronics', essential: true },
  { name: 'Presentation materials', category: 'other', essential: false },

  // Casual
  { name: 'Casual outfit for evenings', category: 'clothing', essential: false },
  { name: 'Gym clothes', category: 'clothing', essential: false },
]

const CAMPING_TRIP: PackingItem[] = [
  // Shelter
  { name: 'Tent', category: 'recreation', essential: true },
  { name: 'Sleeping bag', category: 'recreation', essential: true },
  { name: 'Sleeping pad or air mattress', category: 'recreation', essential: true },
  { name: 'Pillow', category: 'other', essential: false },

  // Cooking
  { name: 'Camp stove & fuel', category: 'recreation', essential: true },
  { name: 'Cookware & utensils', category: 'other', essential: true },
  { name: 'Cooler with ice', category: 'food_drinks', essential: true },
  { name: 'Food & ingredients', category: 'food_drinks', essential: true },
  { name: 'Water bottles/hydration system', category: 'food_drinks', essential: true },
  { name: 'Biodegradable soap', category: 'toiletries', essential: true },

  // Gear
  { name: 'Headlamp or flashlight', category: 'other', essential: true },
  { name: 'Extra batteries', category: 'electronics', essential: true },
  { name: 'First aid kit', category: 'toiletries', essential: true },
  { name: 'Camping chairs', category: 'recreation', essential: false },
  { name: 'Multi-tool or knife', category: 'other', essential: true },
  { name: 'Fire starter/matches', category: 'other', essential: true },
  { name: 'Trash bags', category: 'other', essential: true },

  // Clothing
  { name: 'Layers for varying temperatures', category: 'clothing', essential: true },
  { name: 'Rain jacket', category: 'clothing', essential: true },
  { name: 'Hiking boots', category: 'clothing', essential: true },
  { name: 'Hat & sunglasses', category: 'clothing', essential: true },
]

// ============================================================================
// Template Map
// ============================================================================

export const PACKING_TEMPLATES: Record<PackingTemplate, PackingItem[]> = {
  weekend: WEEKEND_TRIP,
  week: WEEK_LONG_TRIP,
  ev_road_trip: EV_ROAD_TRIP,
  beach: BEACH_TRIP,
  ski: SKI_TRIP,
  business: BUSINESS_TRIP,
  camping: CAMPING_TRIP,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get packing list for a specific template
 */
export function getPackingList(template: PackingTemplate): PackingItem[] {
  return PACKING_TEMPLATES[template] || []
}

/**
 * Combine multiple templates (for multi-purpose trips)
 * Deduplicates items by name
 */
export function combinePackingLists(...templates: PackingTemplate[]): PackingItem[] {
  const combined = new Map<string, PackingItem>()

  for (const template of templates) {
    const items = PACKING_TEMPLATES[template] || []
    for (const item of items) {
      if (!combined.has(item.name)) {
        combined.set(item.name, item)
      }
    }
  }

  return Array.from(combined.values())
}

/**
 * Get packing items by category
 */
export function filterByCategory(items: PackingItem[], category: PackingCategory): PackingItem[] {
  return items.filter(item => item.category === category)
}

/**
 * Get only essential items from a packing list
 */
export function getEssentialItems(items: PackingItem[]): PackingItem[] {
  return items.filter(item => item.essential)
}
