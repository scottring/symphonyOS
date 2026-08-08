// src/shell/Shell.tsx
import { type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SelectionProvider } from './providers/SelectionProvider';
import { MealEventsProvider } from './providers/MealEventsProvider';
import { AssistantLaunchProvider } from '@/contexts/AssistantLaunchContext';
import { AssistantProvider } from '@/contexts/AssistantContext';
import { ShellRoutes } from './ShellRoutes';
import { useFileDropGuard } from '@/hooks/useFileDropGuard';
import { DetailPanel } from './DetailPanel';
import { LegacyDetailPanelHost } from './LegacyDetailPanelHost';
import { appRegistry } from './appRegistry';
import { ShellLayout as DefaultShellLayout } from './ShellLayout';
import { AssistantRail } from './AssistantRail';

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
  // A file dropped outside a real drop zone would otherwise navigate the tab
  // to that file, replacing the app and any unsaved state.
  useFileDropGuard();
  const activeApp = resolveActiveApp(registry, pathname);
  const useChrome = activeApp ? activeApp.chromeless !== true : true;

  const content = (
    <>
      <ShellRoutes registry={registry} />
      <DetailPanel registry={registry} />
      <LegacyDetailPanelHost registry={registry} />
      {/* The rail lives beside the routes, not inside ShellLayout's scrolling
          content div, so it can stay position:fixed. Chromeless (kiosk)
          surfaces render full-bleed and get no rail. */}
      {useChrome && <AssistantRail registry={registry} />}
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
      <AssistantLaunchProvider>
        <AssistantProvider>
          <MealEventsProvider>{wrapped}</MealEventsProvider>
        </AssistantProvider>
      </AssistantLaunchProvider>
    </SelectionProvider>
  );
}
