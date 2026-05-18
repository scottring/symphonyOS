import { useState, useMemo, useCallback, useEffect } from 'react'
import type {
  ContextRule,
  ContextEvalData,
  ActiveContext,
  DismissedContext,
  ContextViewId,
} from './types'
import { DEFAULT_CONTEXT_RULES } from './rules'

function isInTimeWindow(now: Date, rule: ContextRule): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = rule.timeWindow.startHour * 60 + (rule.timeWindow.startMinute ?? 0)
  const endMinutes = rule.timeWindow.endHour * 60 + (rule.timeWindow.endMinute ?? 0)
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes
}

function isDismissed(rule: ContextRule, dismissed: DismissedContext[]): boolean {
  const entry = dismissed.find(d => d.ruleId === rule.id)
  if (!entry) return false

  // Dismissed today? Stay dismissed
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dismissDate = new Date(entry.dismissedAt)
  dismissDate.setHours(0, 0, 0, 0)

  return dismissDate.getTime() === today.getTime()
}

export interface UseContextEngineReturn {
  /** Rules that currently match (sorted by priority) */
  surfacedRules: ContextRule[]
  /** The currently active full-screen context, if any */
  activeContext: ActiveContext | null
  /** Activate a context (user tapped the button) */
  activateContext: (ruleId: string) => void
  /** Dismiss the active context (back to default view) */
  dismissActiveContext: () => void
  /** Dismiss a surfaced button (don't show again today) */
  dismissRule: (ruleId: string) => void
  /** Debug: whether debug mode is active */
  debugMode: boolean
  /** Debug: toggle debug mode (surfaces all rules regardless of time/conditions) */
  toggleDebugMode: () => void
}

export function useContextEngine(
  data: ContextEvalData | null,
  rules: ContextRule[] = DEFAULT_CONTEXT_RULES,
): UseContextEngineReturn {
  // User-picked context overrides the auto-selected one (manual switch).
  const [userPickedContext, setUserPickedContext] = useState<ActiveContext | null>(null)
  const [dismissed, setDismissed] = useState<DismissedContext[]>([])
  const [debugMode, setDebugMode] = useState(false)

  // Evaluate which rules match right now
  const surfacedRules = useMemo(() => {
    if (!data) return []

    // Debug mode: show ALL rules, skip time/condition checks
    if (debugMode) {
      return rules
        .filter(rule => !isDismissed(rule, dismissed))
        .sort((a, b) => b.priority - a.priority)
    }

    return rules
      .filter(rule => {
        // Must not be dismissed
        if (isDismissed(rule, dismissed)) return false
        // Always-available rules bypass time and condition checks
        if (rule.alwaysAvailable) return true
        // Must be in time window
        if (!isInTimeWindow(data.now, rule)) return false
        // Must pass condition (if any)
        if (rule.condition && !rule.condition(data)) return false
        return true
      })
      .sort((a, b) => b.priority - a.priority)
  }, [data, rules, dismissed, debugMode])

  // Active context = user-picked only. The new wall layout (Now Card +
  // Right Column + Rhythm Bar) is the primary surface; ContextOverlay only
  // appears when the user explicitly invokes activateContext(ruleId).
  // (Previously this auto-activated the top surfaced rule, which caused the
  // ContextOverlay to render on top of the wall, hiding it and blocking taps.)
  const activeContext = useMemo<ActiveContext | null>(
    () => userPickedContext,
    [userPickedContext],
  )

  // Re-evaluate every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render to re-evaluate time windows
      setDismissed(prev => [...prev])
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Clear dismissals at midnight
  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    const msUntilMidnight = midnight.getTime() - now.getTime()

    const timeout = setTimeout(() => {
      setDismissed([])
      setUserPickedContext(null)
    }, msUntilMidnight)

    return () => clearTimeout(timeout)
  }, [])

  const activateContext = useCallback((ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) return

    setUserPickedContext({
      ruleId,
      viewId: rule.viewId as ContextViewId,
      activatedAt: new Date(),
    })
  }, [rules])

  const dismissActiveContext = useCallback(() => {
    // Dismiss whatever is currently showing for the rest of today, then
    // fall back to the next surfaced rule (or Calendar if none left).
    if (activeContext) {
      setDismissed(prev => [...prev, { ruleId: activeContext.ruleId, dismissedAt: new Date() }])
    }
    setUserPickedContext(null)
  }, [activeContext])

  const dismissRule = useCallback((ruleId: string) => {
    setDismissed(prev => [...prev, { ruleId, dismissedAt: new Date() }])
  }, [])

  const toggleDebugMode = useCallback(() => {
    setDebugMode(prev => !prev)
    setDismissed([]) // Reset dismissals when toggling
  }, [])

  return {
    surfacedRules,
    activeContext,
    activateContext,
    dismissActiveContext,
    dismissRule,
    debugMode,
    toggleDebugMode,
  }
}
