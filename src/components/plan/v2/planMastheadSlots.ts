// src/components/plan/v2/planMastheadSlots.ts
import { createContext } from 'react'

/** Where a page whose masthead someone else draws (Week: HomeHeader draws
 *  it, WeekV2 owns the plan) portals its folded status and controls. Null —
 *  or a phone — and the page keeps its own control row. */
export const PlanMastheadSlotsContext = createContext<{ subline: HTMLElement | null; controls: HTMLElement | null } | null>(null)
