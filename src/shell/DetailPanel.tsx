// src/shell/DetailPanel.tsx
import { useSelection } from './providers/SelectionProvider';
import { resolveAppForSelection, type AppRegistry } from './appRegistry';

interface Props {
  registry: AppRegistry;
}

export function DetailPanel({ registry }: Props) {
  const { selection } = useSelection();
  if (!selection) return null;
  const app = resolveAppForSelection(registry, selection.kind);
  if (!app?.DetailPanelComponent) return null;
  const Component = app.DetailPanelComponent;
  // Keying on the selection forces a fresh mount when the selection changes,
  // so panels reset their local state (active tab, optimistic edits, etc.)
  // without each panel having to handle prop-driven resets internally.
  return <Component key={`${selection.kind}:${selection.id}`} selection={selection} />;
}
