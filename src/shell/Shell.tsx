// src/shell/Shell.tsx
import type { ComponentType, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { PanelRightOpen } from 'lucide-react';
import { SelectionProvider } from './providers/SelectionProvider';
import { MealEventsProvider } from './providers/MealEventsProvider';
import { ShellRoutes } from './ShellRoutes';
import { DetailPanel } from './DetailPanel';
import { LegacyDetailPanelHost } from './LegacyDetailPanelHost';
import { appRegistry } from './appRegistry';
import { ShellLayout as DefaultShellLayout } from './ShellLayout';
import { ScratchpadPane } from '@/components/schedule/ScratchpadPane';
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden';
import { useSelection } from './providers/SelectionProvider';
import { useMobile } from '@/hooks/useMobile';

interface Props {
  /** Optional override for tests. Defaults to the live appRegistry. */
  registry?: typeof appRegistry;
  /**
   * Cross-cutting layout chrome (sidebar, topbar). Defaults to the
   * production ShellLayout. Override in tests with a stub.
   */
  Layout?: ComponentType<{ children: ReactNode }>;
  /**
   * Legacy escape hatch kept for transition: a render-prop layout.
   * Prefer `Layout` (component) for new callers. If supplied, this
   * unconditionally wraps content (used by old call sites that don't
   * yet know about chromeless apps).
   */
  layout?: (children: ReactNode) => ReactNode;
}

// TODAY paths handled by TasksApp (both legacy parallel and cutover)
const TODAY_PATHS = new Set(['/', '/today', '/tasks-new/today', '/tasks-new']);

/**
 * Renders the quick scratchpad in the right rail when:
 * - desktop (not mobile)
 * - on a Today path
 * - no item is currently selected (detail pane not open)
 *
 * Must be rendered inside <SelectionProvider>.
 */
function ShellScratchpadHost() {
  const { selection } = useSelection();
  const { pathname } = useLocation();
  const isMobile = useMobile();
  const { hidden, setHidden } = useScratchpadHidden();

  const isToday = TODAY_PATHS.has(pathname);
  // Conditions for the scratchpad slot (desktop, today, no detail pane)
  const scratchpadSlot = !isMobile && isToday && selection === null;

  if (!scratchpadSlot) return null;

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        aria-label="Show scratchpad"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-10 bg-bg-elevated border border-neutral-200 rounded-l-lg px-1.5 py-3 text-neutral-400 hover:text-neutral-600 shadow-card transition-colors"
      >
        <PanelRightOpen size={16} />
      </button>
    );
  }

  return (
    <aside
      className="fixed top-0 bottom-0 right-0 w-[480px] bg-bg-base border-l border-neutral-200/80 z-10 p-4"
      aria-label="Scratchpad"
    >
      <ScratchpadPane />
    </aside>
  );
}

/**
 * Identifies the active app by pathname, mirroring ShellRoutes' resolution.
 * Used here (one level above ShellRoutes) so we can decide whether to wrap
 * with ShellLayout before mounting routes.
 */
function resolveActiveApp(registry: typeof appRegistry, pathname: string) {
  const explicit = registry.find((app) => {
    if (app.index) return false;
    if (app.route === '/' || app.route === '') return pathname === '/';
    return pathname === app.route || pathname.startsWith(`${app.route}/`);
  });
  return explicit ?? registry.find((app) => app.index);
}

export function Shell({ registry = appRegistry, Layout = DefaultShellLayout, layout }: Props) {
  const { pathname } = useLocation();
  const activeApp = resolveActiveApp(registry, pathname);
  const useChrome = activeApp ? activeApp.chromeless !== true : true;

  const content = (
    <>
      <ShellRoutes registry={registry} />
      <DetailPanel registry={registry} />
      <LegacyDetailPanelHost registry={registry} />
      <ShellScratchpadHost />
    </>
  );

  // Render-prop override (legacy) wins over the default Layout component
  // — kept so existing test sites keep working unchanged.
  const wrapped = layout
    ? layout(content)
    : useChrome
      ? <Layout>{content}</Layout>
      : content;

  return (
    <SelectionProvider registry={registry}>
      <MealEventsProvider>{wrapped}</MealEventsProvider>
    </SelectionProvider>
  );
}
