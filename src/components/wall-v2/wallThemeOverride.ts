import { useCallback, useEffect, useState } from 'react'

// The wall's light/dark is automatic (light by day, dark after dinner). The
// More-sheet button overrides it only until the next automatic switch.
export const THEME_OVERRIDE_KEY = 'symphony-wall-theme-override'

export interface ThemeOverride {
  /** What the person chose. */
  dark: boolean
  /** The automatic value at the moment they chose; the override ends when it changes. */
  auto: boolean
}

/** Effective dark, plus the override that survives (null once the automatic value moved on). */
export function resolveWallDark(auto: boolean, override: ThemeOverride | null): { dark: boolean; override: ThemeOverride | null } {
  if (override && override.auto === auto) return { dark: override.dark, override }
  return { dark: auto, override: null }
}

function readOverride(): ThemeOverride | null {
  try {
    const v = JSON.parse(localStorage.getItem(THEME_OVERRIDE_KEY) ?? 'null') as Partial<ThemeOverride> | null
    return v && typeof v.dark === 'boolean' && typeof v.auto === 'boolean' ? { dark: v.dark, auto: v.auto } : null
  } catch { return null }
}

function writeOverride(o: ThemeOverride | null) {
  try {
    if (o) localStorage.setItem(THEME_OVERRIDE_KEY, JSON.stringify(o))
    else localStorage.removeItem(THEME_OVERRIDE_KEY)
  } catch { /* noop */ }
}

export function useWallTheme(auto: boolean): { dark: boolean; toggle: () => void } {
  const [stored, setStored] = useState<ThemeOverride | null>(readOverride)
  const { dark, override } = resolveWallDark(auto, stored)
  useEffect(() => {
    if (stored && !override) { setStored(null); writeOverride(null) }
  }, [stored, override])
  const toggle = useCallback(() => {
    const next = { dark: !dark, auto }
    setStored(next)
    writeOverride(next)
  }, [dark, auto])
  return { dark, toggle }
}
