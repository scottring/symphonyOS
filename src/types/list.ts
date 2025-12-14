/**
 * Reference Lists - lightweight memory layer for things to remember that aren't tasks
 * Examples: movies to watch, restaurants to try, gift ideas, kids' sizes
 */

// Category for organizing lists
export type ListCategory =
  | 'entertainment'  // Movies, TV shows, books, music
  | 'food_drink'     // Restaurants, recipes, wines
  | 'shopping'       // Gift ideas, wishlist, stores
  | 'travel'         // Places to visit, hotels, activities
  | 'family_info'    // Kids' sizes, allergies, contacts
  | 'home'           // Home improvement, maintenance
  | 'other'

// Sharing visibility
export type ListVisibility = 'self' | 'family'

// Database row type (snake_case, nullables)
export interface DbList {
  id: string
  user_id: string
  title: string
  icon: string | null
  category: ListCategory
  visibility: ListVisibility
  hidden_from: string[] | null  // User IDs - for gift lists
  project_id: string | null     // Link to a project
  is_template: boolean          // When true, this is a reusable template
  sort_order: number
  created_at: string
  updated_at: string
}

// App type (camelCase, optionals, Date objects)
export interface List {
  id: string
  title: string
  icon?: string  // emoji
  category: ListCategory
  visibility: ListVisibility
  hiddenFrom?: string[]  // User IDs - for gift lists
  projectId?: string     // Link to a project
  isTemplate: boolean    // When true, this is a reusable template
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

// Database row type for list items
export interface DbListItem {
  id: string
  list_id: string
  user_id: string
  text: string
  note: string | null
  is_checked: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// App type for list items
export interface ListItem {
  id: string
  listId: string
  text: string
  note?: string
  isChecked: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

// Helper to get category display name
export function getCategoryLabel(category: ListCategory): string {
  switch (category) {
    case 'entertainment': return 'Entertainment'
    case 'food_drink': return 'Food & Drink'
    case 'shopping': return 'Shopping'
    case 'travel': return 'Travel'
    case 'family_info': return 'Family Info'
    case 'home': return 'Home'
    case 'other': return 'Other'
  }
}

// Helper to get category icon (emoji)
export function getCategoryIcon(category: ListCategory): string {
  switch (category) {
    case 'entertainment': return '🎬'
    case 'food_drink': return '🍽️'
    case 'shopping': return '🛍️'
    case 'travel': return '✈️'
    case 'family_info': return '👨‍👩‍👧‍👦'
    case 'home': return '🏠'
    case 'other': return '📋'
  }
}

// All categories for selection UI
export const LIST_CATEGORIES: ListCategory[] = [
  'entertainment',
  'food_drink',
  'shopping',
  'travel',
  'family_info',
  'home',
  'other',
]
