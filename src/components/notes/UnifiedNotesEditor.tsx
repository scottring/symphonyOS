import { useState, useEffect, useRef, useCallback } from 'react'
import { TiptapEditor } from './TiptapEditor'

interface UnifiedNotesEditorProps {
  /** Current notes value (HTML string) */
  value: string | null | undefined
  /** Called with debounced value changes */
  onChange: (value: string | null) => void
  /** Placeholder text when empty */
  placeholder?: string
  /** Minimum height for the editor in pixels */
  minHeight?: number
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number
  /** Whether the editor is editable (default: true) */
  editable?: boolean
  /** Auto-focus on mount */
  autoFocus?: boolean
}

/**
 * Unified notes editor component that wraps TiptapEditor with:
 * - Built-in debounced saves
 * - Consistent styling across all entity views
 * - Null/undefined handling
 */
export function UnifiedNotesEditor({
  value,
  onChange,
  placeholder = 'Add notes...',
  minHeight = 150,
  debounceMs = 500,
  editable = true,
  autoFocus = false,
}: UnifiedNotesEditorProps) {
  // Local state for immediate UI updates
  const [localValue, setLocalValue] = useState(value || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMount = useRef(true)

  // Sync local state when external value changes (e.g., switching entities)
  useEffect(() => {
    setLocalValue(value || '')
  }, [value])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue)

    // Skip debounce on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Debounce the save
    debounceRef.current = setTimeout(() => {
      // Convert empty string to null for cleaner storage
      const valueToSave = newValue.trim() === '' || newValue === '<p></p>' ? null : newValue
      onChange(valueToSave)
    }, debounceMs)
  }, [onChange, debounceMs])

  return (
    <div style={{ minHeight }}>
      <TiptapEditor
        content={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        editable={editable}
        autoFocus={autoFocus}
      />
    </div>
  )
}
