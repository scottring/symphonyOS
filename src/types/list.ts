/**
 * Reference Lists - lightweight memory layer for things to remember that aren't tasks
 * Examples: movies to watch, restaurants to try, gift ideas, kids' sizes
 */

import {
  LIST_CATEGORY,
  type ListCategoryValue,
  type ListVisibilityValue,
} from './constants'

// Category for organizing lists
export type ListCategory = ListCategoryValue

// Sharing visibility
export type ListVisibility = ListVisibilityValue

// Database row type (snake_case, nullables)
export interface DbList {
  id: string
  user_id: string
  title: string
  icon: string | null
  category: ListCategory
  visibility: ListVisibility
  hidden_from: string[] | null  // User IDs - for gift lists
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
  LIST_CATEGORY.ENTERTAINMENT,
  LIST_CATEGORY.FOOD_DRINK,
  LIST_CATEGORY.SHOPPING,
  LIST_CATEGORY.TRAVEL,
  LIST_CATEGORY.FAMILY_INFO,
  LIST_CATEGORY.HOME,
  LIST_CATEGORY.OTHER,
]
