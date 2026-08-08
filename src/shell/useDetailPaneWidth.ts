// src/shell/useDetailPaneWidth.ts
//
// Width of the currently-open detail pane, or 0 when none is open. The
// assistant rail uses this as its `right` offset so it sits beside the pane
// instead of under it — and so the panes themselves never have to move.
// (Each app's DetailPanelComponent hardcodes its own `fixed right-0` width.)

import { useSelection } from './providers/SelectionProvider'
import { resolveAppForSelection, type AppRegistry } from './appRegistry'
import { DEFAULT_DETAIL_PANEL_WIDTH } from './railLayout'

export function useDetailPaneWidth(registry: AppRegistry): number {
  const { selection } = useSelection()
  if (!selection) return 0
  const app = resolveAppForSelection(registry, selection.kind)
  // A selection whose app has no panel renders nothing — reserve no space.
  if (!app?.DetailPanelComponent) return 0
  return app.detailPanelWidth ?? DEFAULT_DETAIL_PANEL_WIDTH
}
