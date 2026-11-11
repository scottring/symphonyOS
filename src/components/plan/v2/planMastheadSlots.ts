// src/components/plan/v2/planMastheadSlots.ts
import { createContext } from 'react'

/** Where a page whose masthead someone else draws (Week: HomeHeader draws
 *  it, WeekV2 owns the plan) portals its folded status and controls. Null —
 *  or a phone — and the page keeps its own control row. */
export const PlanMastheadSlotsContext = createContext<{ subline: HTMLElement | null; controls: HTMLElement | null } | null>(null)

/** The week's page offers a place for the whole masthead (Scott, 2026-11-11:
 *  Week as an open journal — the masthead on the week's own page, as Today's
 *  is). Its setter: the page hands it an element, HomeView draws HomeHeader
 *  there; null (grid, phone) and the masthead stays above the page. */
export const WeekMastheadHostContext = createContext<((el: HTMLElement | null) => void) | null>(null)
