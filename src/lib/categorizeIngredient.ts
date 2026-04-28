export type GroceryCategory = 'Produce' | 'Dairy' | 'Meat' | 'Pantry' | 'Spices' | 'Other'

export const CATEGORY_ORDER: GroceryCategory[] = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Spices', 'Other']

const PATTERNS: Array<[GroceryCategory, RegExp]> = [
  ['Produce', /\b(apple|banana|berry|berries|grape|lemon|lime|orange|pear|peach|plum|avocado|tomato|onion|garlic|potato|carrot|celery|cucumber|pepper|chili|broccoli|spinach|kale|lettuce|salad|arugula|cabbage|cauliflower|zucchini|squash|mushroom|corn|asparagus|herb|cilantro|parsley|basil|mint|dill|scallion|leek|ginger|fennel|radish|sprouts|greens)\b/i],
  ['Dairy', /\b(milk|cream|yogurt|cheese|butter|egg|eggs|sour cream|cream cheese|cottage cheese|ricotta|mozzarella|parmesan|feta|cheddar|gruy|brie|half[- ]and[- ]half)\b/i],
  ['Meat', /\b(chicken|beef|pork|bacon|ham|sausage|turkey|lamb|veal|salmon|tuna|cod|fish|shrimp|prawn|crab|lobster|scallop|tofu|tempeh)\b/i],
  ['Spices', /\b(salt|pepper|cinnamon|cumin|paprika|oregano|thyme|rosemary|sage|bay leaf|cardamom|coriander|nutmeg|clove|turmeric|saffron|chili powder|garlic powder|onion powder|spice|seasoning)\b/i],
  ['Pantry', /\b(flour|sugar|rice|pasta|noodle|bread|tortilla|oil|vinegar|sauce|broth|stock|bean|lentil|chickpea|tomato paste|tomato sauce|coconut milk|honey|syrup|jam|peanut butter|nut|seed|oat|cereal|crackers)\b/i],
]

export function categorizeIngredient(text: string): GroceryCategory {
  const lower = text.toLowerCase()
  for (const [category, pattern] of PATTERNS) {
    if (pattern.test(lower)) return category
  }
  return 'Other'
}
