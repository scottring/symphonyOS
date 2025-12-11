import { useRef, useCallback, useEffect, useState } from 'react'

/**
 * Custom hook for debouncing callbacks
 *
 * Eliminates the repeated pattern of:
 * const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 * if (debounceRef.current) clearTimeout(debounceRef.current)
 * debounceRef.current = setTimeout(() => ..., 500)
 *
 * Usage:
 * const debouncedSave = useDebouncedCallback((value: string) => {
 *   await saveToServer(value)
 * }, 500)
 *
 * <input onChange={(e) => debouncedSave(e.target.value)} />
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number = 500
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)

  // Update the callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    },
    [delay]
  )
}

/**
 * Hook that returns a debounced version of a value
 *
 * Useful when you want to react to value changes after a delay
 *
 * Usage:
 * const [searchTerm, setSearchTerm] = useState('')
 * const debouncedSearch = useDebouncedValue(searchTerm, 300)
 *
 * useEffect(() => {
 *   performSearch(debouncedSearch)
 * }, [debouncedSearch])
 */
export function useDebouncedValue<T>(value: T, delay: number = 500): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [value, delay])

  return debouncedValue
}
