// src/shell/railLayout.ts
//
// Layout math shared by the assistant rail and the content column, kept pure
// so the branch that matters is testable without mounting ShellLayout (which
// needs a dozen data hooks). See
// docs/superpowers/specs/2026-08-08-sticky-assistant-rail-design.md.

export const ASSISTANT_RAIL_WIDTH = 420
export const DEFAULT_DETAIL_PANEL_WIDTH = 480

interface ContentInsetArgs {
  isMobile: boolean
  /** The assistant rail is open (desktop only — mobile is a full overlay). */
  railOpen: boolean
  /** Width of the open detail pane, or 0 when none is open. */
  detailWidth: number
  /** Viewport is wide enough to reflow content past BOTH panes. */
  isWide: boolean
}

/**
 * CSS `marginRight` for the content column.
 *
 * The detail pane always keeps its flush-right slot; the rail sits to its
 * left. When both are open but the viewport is too narrow to reflow past
 * them, we reserve only the detail pane and let the rail overlay the content
 * — losing a cramped content column beats hiding the conversation.
 */
export function computeContentInset({ isMobile, railOpen, detailWidth, isWide }: ContentInsetArgs): string {
  if (isMobile) return '0'
  const both = railOpen && detailWidth > 0
  if (both) return isWide ? `${detailWidth + ASSISTANT_RAIL_WIDTH}px` : `${detailWidth}px`
  if (detailWidth > 0) return `${detailWidth}px`
  if (railOpen) return `${ASSISTANT_RAIL_WIDTH}px`
  return '0'
}
