export type ContactCategory =
  | 'family'           // Immediate family members
  | 'friend'           // Personal friends
  | 'service_provider' // Plumber, doctor, mechanic, etc.
  | 'professional'     // Work contacts
  | 'school'           // Teachers, school staff
  | 'medical'          // Doctors, specialists
  | 'other'

export interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  notes?: string

  // Categorization
  category?: ContactCategory

  // Family-specific fields (only relevant when category = 'family')
  birthday?: string           // ISO date string (YYYY-MM-DD)
  relationship?: string       // "son", "spouse", "mother", etc.

  // Preferences/facts (freeform, for any category)
  preferences?: string        // "Likes dinosaurs, hates carrots, shoe size 5"

  // Google Place id, set when this contact was created from a Places result.
  // Used to dedupe: re-picking the same place reuses this contact.
  placeId?: string

  createdAt: Date
  updatedAt: Date
}

// Helper to get display label for category
export function getCategoryLabel(category: ContactCategory | undefined): string {
  switch (category) {
    case 'family': return 'Family'
    case 'friend': return 'Friend'
    case 'service_provider': return 'Service Provider'
    case 'professional': return 'Professional'
    case 'school': return 'School'
    case 'medical': return 'Medical'
    case 'other': return 'Other'
    default: return ''
  }
}

// Helper to get icon for category
export function getCategoryIcon(category: ContactCategory | undefined): string {
  switch (category) {
    case 'family': return '👨‍👩‍👧‍👦'
    case 'friend': return '🤝'
    case 'service_provider': return '🔧'
    case 'professional': return '💼'
    case 'school': return '🎓'
    case 'medical': return '🏥'
    case 'other': return '👤'
    default: return '👤'
  }
}
