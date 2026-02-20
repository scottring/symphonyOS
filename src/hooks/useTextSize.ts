import { useState, useEffect } from 'react'

const STORAGE_KEY = 'symphony-large-text'

export function useTextSize() {
  const [largeText, setLargeText] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText)
    localStorage.setItem(STORAGE_KEY, String(largeText))
  }, [largeText])

  // Apply on initial mount (before first render paints)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === 'true'
    if (stored) {
      document.documentElement.classList.add('large-text')
    }
  }, [])

  return { largeText, setLargeText }
}
