// src/shell/LegacyDetailPanelHost.tsx
//
// @deprecated — host for selection kinds that don't yet have an app extracted
// into appRegistry. As of P4 the only app that owns selections is `tasks`
// (kind `task`). Future kinds — `contact`, `project`, `routine`, `event` —
// will be claimed by their own apps as they're extracted from App.tsx.
//
// Today this host is intentionally a no-op. It exists in Shell composition so:
//
// 1. The seam is in place — when an app for a legacy kind ships, that app's
//    DetailPanelComponent will start rendering through the regular DetailPanel
//    pipeline (claimed via `ownsSelectionKinds`), and we can remove the kind's
//    branch here.
// 2. Selection refs whose kind isn't yet claimed are silently dropped by
//    SelectionProvider's clearing effect — that's by design. If a consumer
//    wants to surface a non-task detail at /tasks-new/* it must either own
//    the kind via an app or fall through to the legacy /today path.
//
// If/when we want a non-task detail to render under /tasks-new before the
// dedicated app exists, this host is where to do it: switch on
// selection.kind, look up the entity via the appropriate hook (useContacts,
// useProjects, useRoutines, useEvents), build a TimelineItem-shaped object,
// and render <DetailPanelRedesign item={...} ... />. See P4-A's notes on
// extraction strategy.

import type { AppRegistry } from './appRegistry';
import { useSelection } from './providers/SelectionProvider';
import { resolveAppForSelection } from './appRegistry';

interface Props {
  registry: AppRegistry;
}

/**
 * Renders nothing today. Mounted in Shell alongside <DetailPanel> as a placeholder
 * for non-task selection kinds that don't yet have a dedicated app.
 *
 * Returns null when:
 * - There's no selection
 * - The selected kind is owned by an app (DetailPanel handles it)
 * - The selected kind isn't owned (this host would render — it doesn't yet)
 */
export function LegacyDetailPanelHost({ registry }: Props) {
  const { selection } = useSelection();
  if (!selection) return null;
  // If a registered app owns this kind, the regular DetailPanel renders it.
  const claimed = resolveAppForSelection(registry, selection.kind);
  if (claimed) return null;
  // No app claims this kind. Today we render nothing — SelectionProvider's
  // clearing effect has likely already stripped the URL ?detail param.
  // TODO(autonomous-symphony-refactor): when a legacy kind needs to render
  // under /tasks-new before its app is extracted, branch on selection.kind
  // here and synthesize a TimelineItem for DetailPanelRedesign.
  return null;
}
