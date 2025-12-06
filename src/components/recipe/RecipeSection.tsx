import { useState } from 'react'
import type { Task } from '@/types/task'
import { PrepTasksList } from './PrepTasksList'

interface RecipeSectionProps {
  recipeUrl: string | null | undefined
  eventTitle: string
  eventTime?: Date
  prepTasks?: Task[]
  onOpenRecipe: (url: string) => void
  onUpdateRecipeUrl: (url: string | null) => void
  onAddPrepTask?: (title: string, scheduledFor: Date) => Promise<string | undefined>
  onTogglePrepTask?: (taskId: string) => void
  onOpenTask?: (taskId: string) => void
}

/**
 * Recipe section for the detail panel
 * Shows when an event has a recipe URL (detected or manually attached)
 * Allows viewing, attaching, or removing recipe links
 */
export function RecipeSection({
  recipeUrl,
  eventTitle,
  eventTime,
  prepTasks = [],
  onOpenRecipe,
  onUpdateRecipeUrl,
  onAddPrepTask,
  onTogglePrepTask,
  onOpenTask,
}: RecipeSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputUrl, setInputUrl] = useState('')

  const handleAttachRecipe = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputUrl.trim()
    if (trimmed) {
      // Ensure URL has protocol
      const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
      onUpdateRecipeUrl(url)
      setInputUrl('')
      setIsEditing(false)
    }
  }

  const handleRemoveRecipe = () => {
    onUpdateRecipeUrl(null)
  }

  // Extract display name from URL
  const getRecipeDisplayName = (url: string): string => {
    try {
      const parsed = new URL(url)
      const hostname = parsed.hostname.replace(/^www\./, '')
      // Try to get a friendly name from the path
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
        // Convert slug to title case
        const name = lastPart
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .replace(/\d+/g, '') // Remove numbers
          .trim()
        if (name.length > 3) {
          return name.charAt(0).toUpperCase() + name.slice(1)
        }
      }
      return `Recipe from ${hostname}`
    } catch {
      return 'Recipe'
    }
  }

  // Has recipe attached
  if (recipeUrl) {
    return (
      <div className="px-5 py-4 border-b border-neutral-100">
        <div className="flex items-start gap-3">
          {/* Recipe icon */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1h-1V6a1 1 0 10-2 0v1H8V6zm10 8.868a3.704 3.704 0 01-4.055-.036 1.704 1.704 0 00-1.89 0 3.704 3.704 0 01-4.11 0 1.704 1.704 0 00-1.89 0A3.704 3.704 0 012 14.868V17a1 1 0 001 1h14a1 1 0 001-1v-2.132zM9 3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Recipe info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-neutral-800 mb-1">
              {getRecipeDisplayName(recipeUrl)}
            </h3>
            <p className="text-xs text-neutral-500 truncate mb-3">
              {new URL(recipeUrl).hostname.replace(/^www\./, '')}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => onOpenRecipe(recipeUrl)}
                className="flex-1 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
                View Recipe
              </button>
              <button
                onClick={handleRemoveRecipe}
                className="px-3 py-2 text-neutral-500 hover:text-danger-600 hover:bg-danger-50 text-sm rounded-lg transition-colors"
                title="Remove recipe"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Prep Tasks */}
        {eventTime && onAddPrepTask && onTogglePrepTask && (
          <PrepTasksList
            prepTasks={prepTasks}
            eventTime={eventTime}
            onAddPrepTask={onAddPrepTask}
            onTogglePrepTask={onTogglePrepTask}
            onOpenTask={onOpenTask}
          />
        )}
      </div>
    )
  }

  // No recipe - show attach option (only for meal-related events)
  // Check if event title suggests it's a meal
  const mealKeywords = ['dinner', 'lunch', 'breakfast', 'meal', 'cook', 'make', 'bake', 'recipe']
  const isMealEvent = mealKeywords.some(keyword =>
    eventTitle.toLowerCase().includes(keyword)
  )

  if (!isMealEvent) {
    return null // Don't show recipe section for non-meal events
  }

  return (
    <div className="px-5 py-4 border-b border-neutral-100">
      {isEditing ? (
        <form onSubmit={handleAttachRecipe} className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-neutral-600 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1h-1V6a1 1 0 10-2 0v1H8V6zm10 8.868a3.704 3.704 0 01-4.055-.036 1.704 1.704 0 00-1.89 0 3.704 3.704 0 01-4.11 0 1.704 1.704 0 00-1.89 0A3.704 3.704 0 012 14.868V17a1 1 0 001 1h14a1 1 0 001-1v-2.132zM9 3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            Attach Recipe
          </div>
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste recipe URL..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false)
                setInputUrl('')
              }}
              className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!inputUrl.trim()}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Attach
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full flex items-center gap-3 p-3 -m-3 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1h-1V6a1 1 0 10-2 0v1H8V6zm10 8.868a3.704 3.704 0 01-4.055-.036 1.704 1.704 0 00-1.89 0 3.704 3.704 0 01-4.11 0 1.704 1.704 0 00-1.89 0A3.704 3.704 0 012 14.868V17a1 1 0 001 1h14a1 1 0 001-1v-2.132zM9 3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium">No recipe attached</p>
            <p className="text-xs text-neutral-400">Tap to add a recipe link</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
