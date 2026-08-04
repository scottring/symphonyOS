/**
 * Shared sizing for mobile chrome elements that must clear the fixed bottom
 * tab bar (ShellLayout.tsx's `<nav>`).
 *
 * This is NOT derivable by summing the tab bar's Tailwind classes (py-1.5,
 * icon size, label size, etc.) — a global mobile touch-target rule in
 * src/index.css (`@media (max-width: 768px) { button { padding: 0.875rem
 * 1.5rem; ... } }`) is unlayered CSS, so it overrides every Tailwind utility
 * on every <button>, tab-bar buttons included, regardless of what padding
 * classes they carry. The bar's real rendered height only shows up by
 * measuring it in the browser (~4.65rem at the default 17px mobile root
 * font-size) — reading the source is not enough.
 *
 * Anything that must clear the bar reads this ONE constant instead of
 * re-deriving or re-guessing the height, so they cannot drift apart again
 * (which is exactly what happened before: the content frame's padding and
 * the bar's actual height disagreed, clipping AttentionLine).
 */
export const MOBILE_TAB_BAR_HEIGHT = '4.75rem'
