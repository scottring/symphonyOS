// Quiet hours for the always-on wall kiosk.
//
// The wall is a touchscreen that stays powered and *visible* 24/7, so the usual
// `document.hidden` guard never trips for it. That left its background pollers
// (useWallData, useKioskCards, WallScratchpad, …) hammering Supabase all night —
// ~540 REST requests/hour at 3am with nobody awake — which is what triggered
// Supabase's egress-shutdown warning. Nobody reads the wall overnight, so during
// quiet hours we skip the periodic refetch. Initial mount fetches, the manual
// refresh button, and visibility-return all still work, so a 2am glance after a
// tap is always fresh.

const QUIET_START_HOUR = 23 // 11pm, inclusive
const QUIET_END_HOUR = 6 // 6am, exclusive

/** True during the overnight window when wall pollers should back off. */
export function isQuietHours(date: Date = new Date()): boolean {
  const h = date.getHours()
  // Window wraps past midnight: [23:00, 24:00) ∪ [00:00, 06:00).
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR
}
