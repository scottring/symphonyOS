export type GroceryCategory = 'Produce' | 'Dairy' | 'Meat' | 'Pantry' | 'Spices' | 'Other'

export const CATEGORY_ORDER: GroceryCategory[] = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Spices', 'Other']

// Each noun gets an optional plural suffix so plural forms ("carrots", "scallions",
// "cherry tomatoes") match alongside singular. Irregular plurals (berry/berries,
// tomato/tomatoes, potato/potatoes, leaf/leaves) are listed explicitly.
const PATTERNS: Array<[GroceryCategory, RegExp]> = [
  ['Produce', /\b(apples?|bananas?|berry|berries|grapes?|lemons?|limes?|oranges?|pears?|peach(?:es)?|plums?|avocados?|tomato(?:es)?|onions?|garlic|potato(?:es)?|carrots?|celery|cucumbers?|peppers?|chili(?:es|s)?|broccoli|spinach|kale|lettuce|salad|arugula|cabbages?|cauliflowers?|zucchinis?|squash(?:es)?|mushrooms?|corn|asparagus|herbs?|cilantro|parsley|basil|mint|dill|scallions?|leeks?|ginger|fennel|radish(?:es)?|sprouts?|greens)\b/i],
  ['Dairy', /\b(milk|cream|yogurts?|cheese|butter|eggs?|sour cream|cream cheese|cottage cheese|ricotta|mozzarella|parmesan|feta|cheddar|gruy|brie|half[- ]and[- ]half)\b/i],
  ['Meat', /\b(chicken|beef|pork|bacon|hams?|sausages?|turkey|lamb|veal|salmon|tuna|cod|fish|shrimps?|prawns?|crabs?|lobsters?|scallops?|tofu|tempeh)\b/i],
  ['Spices', /\b(salt|pepper|cinnamon|cumin|paprika|oregano|thyme|rosemary|sage|bay leaf|bay leaves|cardamom|coriander|nutmeg|cloves?|turmeric|saffron|chili powder|garlic powder|onion powder|spices?|seasonings?)\b/i],
  ['Pantry', /\b(flour|sugar|rice|pasta|noodles?|bread|tortillas?|oil|vinegar|sauce|broth|stock|beans?|lentils?|chickpeas?|tomato paste|tomato sauce|coconut milk|honey|syrup|jam|peanut butter|nuts?|seeds?|oats?|cereal|crackers)\b/i],
]

export function categorizeIngredient(text: string): GroceryCategory {
  const lower = text.toLowerCase()
  for (const [category, pattern] of PATTERNS) {
    if (pattern.test(lower)) return category
  }
  return 'Other'
}
