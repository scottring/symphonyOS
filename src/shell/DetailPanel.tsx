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
  return <Component selection={selection} />;
}
