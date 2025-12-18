/**
 * Theme Configuration
 *
 * Toggle between different design systems:
 * - 'nordic' - Original Nordic Journal design (Editorial Calm)
 * - 'kinetic' - New Kinetic Clarity design (Dynamic & Energized)
 */

export type ThemeVariant = 'nordic' | 'kinetic'

// Change this value to switch themes
export const ACTIVE_THEME: ThemeVariant = 'kinetic'

// Theme metadata
export const THEMES = {
  nordic: {
    name: 'Nordic Journal',
    description: 'Editorial calm with warm, confident minimalism',
    cssFile: 'index.css',
  },
  kinetic: {
    name: 'Kinetic Clarity',
    description: 'Energized and dynamic with spatial depth',
    cssFile: 'kinetic-clarity.css',
  },
} as const
