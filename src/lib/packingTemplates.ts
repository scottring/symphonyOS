/**
 * Packing List Templates
 * Predefined packing lists for different trip types
 * Using simplified PackingNode structure (headings + checklist items)
 */

import type { PackingNode, PackingTemplate } from '@/types/trip'

// ============================================================================
// Packing List Templates
// ============================================================================

const WEEKEND_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Clothing' },
  { type: 'item', text: 'Outfits (2-3 days)', checked: false },
  { type: 'item', text: 'Underwear & socks (3 sets)', checked: false },
  { type: 'item', text: 'Pajamas', checked: false },
  { type: 'item', text: 'Jacket or sweater', checked: false },
  { type: 'item', text: 'Comfortable shoes', checked: false },
  { type: 'item', text: 'Extra pair of shoes', checked: false },

  { type: 'heading', level: 2, text: 'Toiletries' },
  { type: 'item', text: 'Toothbrush & toothpaste', checked: false },
  { type: 'item', text: 'Deodorant', checked: false },
  { type: 'item', text: 'Shampoo & conditioner', checked: false },
  { type: 'item', text: 'Body wash or soap', checked: false },
  { type: 'item', text: 'Hairbrush or comb', checked: false },
  { type: 'item', text: 'Medications', checked: false },
  { type: 'item', text: 'Sunscreen', checked: false },

  { type: 'heading', level: 2, text: 'Electronics' },
  { type: 'item', text: 'Phone charger', checked: false },
  { type: 'item', text: 'Portable battery pack', checked: false },
  { type: 'item', text: 'Headphones', checked: false },

  { type: 'heading', level: 2, text: 'Documents' },
  { type: 'item', text: "ID/Driver's license", checked: false },
  { type: 'item', text: 'Credit/debit cards', checked: false },
  { type: 'item', text: 'Insurance cards', checked: false },

  { type: 'heading', level: 2, text: 'Food & Drinks' },
  { type: 'item', text: 'Water bottle', checked: false },
  { type: 'item', text: 'Snacks for travel', checked: false },
]

const WEEK_LONG_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Clothing' },
  { type: 'item', text: 'Outfits (7-8 days)', checked: false },
  { type: 'item', text: 'Underwear & socks (8 sets)', checked: false },
  { type: 'item', text: 'Pajamas', checked: false },
  { type: 'item', text: 'Jacket or sweater', checked: false },
  { type: 'item', text: 'Comfortable shoes', checked: false },
  { type: 'item', text: 'Extra pair of shoes', checked: false },
  { type: 'item', text: 'Workout clothes', checked: false },
  { type: 'item', text: 'Swimsuit', checked: false },
  { type: 'item', text: 'Dressy outfit', checked: false },

  { type: 'heading', level: 2, text: 'Toiletries' },
  { type: 'item', text: 'Toothbrush & toothpaste', checked: false },
  { type: 'item', text: 'Deodorant', checked: false },
  { type: 'item', text: 'Shampoo & conditioner', checked: false },
  { type: 'item', text: 'Body wash or soap', checked: false },
  { type: 'item', text: 'Hairbrush or comb', checked: false },
  { type: 'item', text: 'Medications', checked: false },
  { type: 'item', text: 'Sunscreen', checked: false },
  { type: 'item', text: 'Laundry detergent packets', checked: false },
  { type: 'item', text: 'First aid kit', checked: false },

  { type: 'heading', level: 2, text: 'Electronics' },
  { type: 'item', text: 'Phone charger', checked: false },
  { type: 'item', text: 'Portable battery pack', checked: false },
  { type: 'item', text: 'Headphones', checked: false },
  { type: 'item', text: 'Laptop & charger', checked: false },
  { type: 'item', text: 'E-reader or books', checked: false },
  { type: 'item', text: 'Camera', checked: false },

  { type: 'heading', level: 2, text: 'Documents' },
  { type: 'item', text: "ID/Driver's license", checked: false },
  { type: 'item', text: 'Credit/debit cards', checked: false },
  { type: 'item', text: 'Insurance cards', checked: false },

  { type: 'heading', level: 2, text: 'Food & Drinks' },
  { type: 'item', text: 'Water bottle', checked: false },
  { type: 'item', text: 'Snacks for travel', checked: false },
]

const EV_ROAD_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'EV Equipment' },
  { type: 'item', text: 'EV charging adapter (if needed)', checked: false },
  { type: 'item', text: 'Charging cable', checked: false },
  { type: 'item', text: 'Extension cord (for destination charging)', checked: false },
  { type: 'item', text: 'Tire pressure gauge', checked: false },
  { type: 'item', text: 'Emergency roadside kit', checked: false },

  { type: 'heading', level: 2, text: 'Food & Drinks' },
  { type: 'item', text: 'Cooler with drinks & snacks', checked: false },
  { type: 'item', text: 'Coffee/tea thermos', checked: false },

  { type: 'heading', level: 2, text: 'Recreation' },
  { type: 'item', text: 'Road trip playlist', checked: false },
  { type: 'item', text: 'Audiobooks or podcasts downloaded', checked: false },
  { type: 'item', text: 'Pillow & blanket', checked: false },

  { type: 'heading', level: 2, text: 'Electronics' },
  { type: 'item', text: 'Phone mount for navigation', checked: false },
]

const BEACH_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Clothing' },
  { type: 'item', text: 'Swimsuit', checked: false },
  { type: 'item', text: 'Cover-up', checked: false },
  { type: 'item', text: 'Flip-flops or sandals', checked: false },
  { type: 'item', text: 'Sun hat', checked: false },
  { type: 'item', text: 'Sunglasses', checked: false },

  { type: 'heading', level: 2, text: 'Beach Gear' },
  { type: 'item', text: 'Beach towel', checked: false },
  { type: 'item', text: 'Beach bag', checked: false },
  { type: 'item', text: 'Beach umbrella or tent', checked: false },
  { type: 'item', text: 'Beach chair', checked: false },
  { type: 'item', text: 'Snorkel gear', checked: false },
  { type: 'item', text: 'Beach toys/games', checked: false },

  { type: 'heading', level: 2, text: 'Toiletries' },
  { type: 'item', text: 'Sunscreen (SPF 30+)', checked: false },
  { type: 'item', text: 'After-sun lotion', checked: false },

  { type: 'heading', level: 2, text: 'Electronics' },
  { type: 'item', text: 'Waterproof phone case', checked: false },

  { type: 'heading', level: 2, text: 'Recreation' },
  { type: 'item', text: 'Book or e-reader', checked: false },
]

const SKI_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Ski Clothing' },
  { type: 'item', text: 'Ski jacket', checked: false },
  { type: 'item', text: 'Ski pants', checked: false },
  { type: 'item', text: 'Base layers (2-3 sets)', checked: false },
  { type: 'item', text: 'Wool socks (3-4 pairs)', checked: false },
  { type: 'item', text: 'Gloves or mittens', checked: false },
  { type: 'item', text: 'Hat or beanie', checked: false },
  { type: 'item', text: 'Neck warmer or balaclava', checked: false },
  { type: 'item', text: 'Goggles', checked: false },

  { type: 'heading', level: 2, text: 'Ski Gear' },
  { type: 'item', text: 'Skis/snowboard (if not renting)', checked: false },
  { type: 'item', text: 'Ski boots (if not renting)', checked: false },
  { type: 'item', text: 'Helmet', checked: false },
  { type: 'item', text: 'Hand/toe warmers', checked: false },

  { type: 'heading', level: 2, text: 'After-Ski' },
  { type: 'item', text: 'Warm casual clothes', checked: false },
  { type: 'item', text: 'Lip balm with SPF', checked: false },
  { type: 'item', text: 'Moisturizer', checked: false },
]

const BUSINESS_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Professional Attire' },
  { type: 'item', text: 'Business suits/outfits', checked: false },
  { type: 'item', text: 'Dress shoes', checked: false },
  { type: 'item', text: 'Belt', checked: false },
  { type: 'item', text: 'Professional accessories', checked: false },

  { type: 'heading', level: 2, text: 'Work Essentials' },
  { type: 'item', text: 'Laptop & charger', checked: false },
  { type: 'item', text: 'Work documents/files', checked: false },
  { type: 'item', text: 'Business cards', checked: false },
  { type: 'item', text: 'Notebook & pen', checked: false },
  { type: 'item', text: 'Phone charger & adapter', checked: false },
  { type: 'item', text: 'Presentation materials', checked: false },

  { type: 'heading', level: 2, text: 'Casual' },
  { type: 'item', text: 'Casual outfit for evenings', checked: false },
  { type: 'item', text: 'Gym clothes', checked: false },
]

const CAMPING_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Shelter' },
  { type: 'item', text: 'Tent', checked: false },
  { type: 'item', text: 'Sleeping bag', checked: false },
  { type: 'item', text: 'Sleeping pad or air mattress', checked: false },
  { type: 'item', text: 'Pillow', checked: false },

  { type: 'heading', level: 2, text: 'Cooking' },
  { type: 'item', text: 'Camp stove & fuel', checked: false },
  { type: 'item', text: 'Cookware & utensils', checked: false },
  { type: 'item', text: 'Cooler with ice', checked: false },
  { type: 'item', text: 'Food & ingredients', checked: false },
  { type: 'item', text: 'Water bottles/hydration system', checked: false },
  { type: 'item', text: 'Biodegradable soap', checked: false },

  { type: 'heading', level: 2, text: 'Gear' },
  { type: 'item', text: 'Headlamp or flashlight', checked: false },
  { type: 'item', text: 'Extra batteries', checked: false },
  { type: 'item', text: 'First aid kit', checked: false },
  { type: 'item', text: 'Camping chairs', checked: false },
  { type: 'item', text: 'Multi-tool or knife', checked: false },
  { type: 'item', text: 'Fire starter/matches', checked: false },
  { type: 'item', text: 'Trash bags', checked: false },

  { type: 'heading', level: 2, text: 'Clothing' },
  { type: 'item', text: 'Layers for varying temperatures', checked: false },
  { type: 'item', text: 'Rain jacket', checked: false },
  { type: 'item', text: 'Hiking boots', checked: false },
  { type: 'item', text: 'Hat & sunglasses', checked: false },
]

const COLD_WEATHER_TRIP: PackingNode[] = [
  { type: 'heading', level: 2, text: 'Cold Weather Clothing' },
  { type: 'item', text: 'Winter coats', checked: false },
  { type: 'item', text: 'Snow boots or warm boots', checked: false },
  { type: 'item', text: 'Warm gloves or mittens', checked: false },
  { type: 'item', text: 'Winter hats/beanies', checked: false },
  { type: 'item', text: 'Scarves or neck warmers', checked: false },
  { type: 'item', text: 'Thermal underwear/base layers', checked: false },
  { type: 'item', text: 'Warm socks (7-10 pairs)', checked: false },
  { type: 'item', text: 'Sweaters or fleeces', checked: false },
  { type: 'item', text: 'Jeans or warm pants', checked: false },
  { type: 'item', text: 'Pajamas', checked: false },
  { type: 'item', text: 'Regular underwear (7-8 sets)', checked: false },

  { type: 'heading', level: 2, text: 'Toiletries' },
  { type: 'item', text: 'Toothbrush & toothpaste', checked: false },
  { type: 'item', text: 'Shampoo & conditioner', checked: false },
  { type: 'item', text: 'Body wash or soap', checked: false },
  { type: 'item', text: 'Deodorant', checked: false },
  { type: 'item', text: 'Moisturizer (for dry winter air)', checked: false },
  { type: 'item', text: 'Lip balm with SPF', checked: false },
  { type: 'item', text: 'Hairbrush or comb', checked: false },
  { type: 'item', text: 'Sunscreen SPF 30+', checked: false },

  { type: 'heading', level: 2, text: 'Health & Safety' },
  { type: 'item', text: 'First aid kit', checked: false },
  { type: 'item', text: 'Pain relievers', checked: false },
  { type: 'item', text: 'Prescription medications', checked: false },
  { type: 'item', text: 'Hand warmers', checked: false },
  { type: 'item', text: 'Tissues', checked: false },

  { type: 'heading', level: 2, text: 'Electronics' },
  { type: 'item', text: 'Phone chargers', checked: false },
  { type: 'item', text: 'Camera', checked: false },
  { type: 'item', text: 'Power bank', checked: false },
  { type: 'item', text: 'Travel adapter', checked: false },

  { type: 'heading', level: 2, text: 'Documents' },
  { type: 'item', text: 'IDs or passports', checked: false },
  { type: 'item', text: 'Hotel confirmations', checked: false },
  { type: 'item', text: 'Travel insurance', checked: false },
  { type: 'item', text: 'Credit cards & cash', checked: false },

  { type: 'heading', level: 2, text: 'Other' },
  { type: 'item', text: 'Reusable water bottles', checked: false },
  { type: 'item', text: 'Snacks for travel', checked: false },
  { type: 'item', text: 'Books or entertainment', checked: false },
  { type: 'item', text: 'Small backpack for day trips', checked: false },
]

// ============================================================================
// Template Map
// ============================================================================

export const PACKING_TEMPLATES: Record<PackingTemplate, PackingNode[]> = {
  weekend: WEEKEND_TRIP,
  week: WEEK_LONG_TRIP,
  ev_road_trip: EV_ROAD_TRIP,
  beach: BEACH_TRIP,
  ski: SKI_TRIP,
  business: BUSINESS_TRIP,
  camping: CAMPING_TRIP,
  cold_weather: COLD_WEATHER_TRIP,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get packing list for a specific template
 */
export function getPackingList(template: PackingTemplate): PackingNode[] {
  return PACKING_TEMPLATES[template] || []
}

/**
 * Combine multiple templates (for multi-purpose trips)
 * Deduplicates items by text
 */
export function combinePackingLists(...templates: PackingTemplate[]): PackingNode[] {
  const combined = new Map<string, PackingNode>()

  for (const template of templates) {
    const nodes = PACKING_TEMPLATES[template] || []
    for (const node of nodes) {
      const key = node.type === 'heading' ? `h${node.level}:${node.text}` : `item:${node.text}`
      if (!combined.has(key)) {
        combined.set(key, node)
      }
    }
  }

  return Array.from(combined.values())
}
