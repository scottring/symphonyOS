/**
 * The single source of truth for a page's content column — gutter, max-width,
 * and vertical rhythm. Every rhythm/library surface uses this (via the
 * <PageContainer> component, or applied directly on pages whose structure makes
 * wrapping awkward) so the app stops shipping five max-widths and six paddings.
 *
 * The column is CENTERED (design-unification pass, 2026-09-01): Today, Notes
 * and Documents — the pages that set the app's look — all center their
 * columns, and a left-hugging page beside them reads as belonging to a
 * different app. The earlier left-aligned rationale (gutter stays put when
 * the right pane opens) traded consistency for a smaller reflow; Today has
 * always taken the reflow, so every page now does the same.
 */
const PAGE_GUTTER = 'px-6 md:px-10 lg:px-14 py-8'

/** Default column — rhythm views + library lists. */
export const PAGE_COLUMN = `w-full max-w-[940px] mx-auto ${PAGE_GUTTER}`

/** Wide column — detail pages that need more room (e.g. project detail). */
export const PAGE_COLUMN_WIDE = `w-full max-w-[1152px] mx-auto ${PAGE_GUTTER}`

/** Full-bleed column — hands-on WORK pages (e.g. /season) where a narrow column
 *  cramps a two-pane grid and wastes the right half of a wide screen. No
 *  max-width: fills the available width (minus gutter and any open pane). */
export const PAGE_COLUMN_FULL = `w-full ${PAGE_GUTTER}`
