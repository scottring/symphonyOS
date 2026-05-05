// src/shell/Shell.tsx
import type { ReactNode } from 'react';
import { SelectionProvider } from './providers/SelectionProvider';
import { ShellRoutes } from './ShellRoutes';
import { DetailPanel } from './DetailPanel';
import { appRegistry } from './appRegistry';

interface Props {
  /** Optional override for tests. Defaults to the live appRegistry. */
  registry?: typeof appRegistry;
  /** Cross-cutting layout chrome (sidebar, topbar, capture). Provided by ShellLayout in production. */
  layout?: (children: ReactNode) => ReactNode;
}

export function Shell({ registry = appRegistry, layout }: Props) {
  const content = (
    <>
      <ShellRoutes registry={registry} />
      <DetailPanel registry={registry} />
    </>
  );
  return (
    <SelectionProvider registry={registry}>
      {layout ? layout(content) : content}
    </SelectionProvider>
  );
}
