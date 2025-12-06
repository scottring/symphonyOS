/**
 * Project-related utility functions
 */

/**
 * Color palette for project indicators.
 * Nordic-inspired but distinguishable colors.
 */
export const PROJECT_COLORS = [
  '#5B8A72', // forest green
  '#6B7FA8', // nordic blue
  '#8B6B8A', // plum
  '#B8956B', // amber wood
  '#7BA3A3', // teal
  '#A86B5B', // brick
  '#7B8B5B', // olive
  '#5B7B8B', // slate
] as const

/**
 * Generate a consistent color for a project based on its ID.
 * Uses a simple hash function to map any string to an index in the color palette.
 *
 * @param projectId - The project's unique identifier
 * @returns A hex color string from the PROJECT_COLORS palette
 */
export function getProjectColor(projectId: string): string {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]
}
