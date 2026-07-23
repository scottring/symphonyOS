// src/shell/Shell.tsx
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { PanelRightOpen } from 'lucide-react';
import { NoteViewer } from '@/components/chat/NoteViewer';
import { SelectionProvider } from './providers/SelectionProvider';
import { MealEventsProvider } from './providers/MealEventsProvider';
import { AssistantLaunchProvider, useAssistantLaunchRequests } from '@/contexts/AssistantLaunchContext';
import { ShellRoutes } from './ShellRoutes';
import { DetailPanel } from './DetailPanel';
import { LegacyDetailPanelHost } from './LegacyDetailPanelHost';
import { appRegistry } from './appRegistry';
import { ShellLayout as DefaultShellLayout } from './ShellLayout';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant';
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
 * Renders the fenced Symphony assistant (ChatPanel) in the right rail when:
 * - desktop (not mobile)
 * - on a Today path
 * - no item is currently selected (detail pane not open)
 *
 * This mirrors the legacy AppShell right-rail pane (repointed to the fenced
 * Symphony agent in ce216cd) — the new Shell previously rendered the old
 * scratchpad here, which had been retired from the legacy app. The
 * `useScratchpadHidden` toggle is reused for the rail's hide/show affordance.
 *
 * Must be rendered inside <SelectionProvider>.
 *
 * NOTE: the agent's writes are picked up by the task list's realtime
 * subscription; we intentionally do not pass an `onMutate` refetch here to
 * avoid opening a second tasks subscription from the rail. Wiring a shared
 * refetch is a follow-up if realtime proves insufficient for edge-fn writes.
 */
function ShellAssistantHost() {
  const { selection } = useSelection();
  const { pathname } = useLocation();
  const isMobile = useMobile();
  const { hidden, setHidden } = useScratchpadHidden();
  const assistant = useSymphonyAssistant({ persistKey: 'symphony_rail' });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const isToday = TODAY_PATHS.has(pathname);

  // Programmatic launches (unibox "Ask Symphony", plan cards…): this host owns
  // desktop-Today; ShellLayout's rail owns everything else (incl. mobile).
  const { nonce, consumeSeed } = useAssistantLaunchRequests();
  const seenNonce = useRef(0);
  useEffect(() => {
    if (nonce === 0 || nonce === seenNonce.current) return;
    if (isMobile || !isToday) return;
    seenNonce.current = nonce;
    setHidden(false);
    const seed = consumeSeed();
    if (seed && seed.autoSend !== false) void assistant.sendMessage(seed.message);
  }, [nonce, isMobile, isToday, consumeSeed, assistant, setHidden]);

  // Conditions for the rail slot (desktop, today, no detail pane open)
  const railSlot = !isMobile && isToday && selection === null;

  if (!railSlot) return null;

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        aria-label="Show Symphony AI"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-10 bg-bg-elevated border border-neutral-200 rounded-l-lg px-1.5 py-3 text-neutral-400 hover:text-neutral-600 shadow-card transition-colors"
      >
        <PanelRightOpen size={16} />
      </button>
    );
  }

  return (
    <>
      <aside
        className="fixed top-0 bottom-0 right-0 w-[420px] z-10"
        aria-label="Symphony AI"
      >
        <ChatPanel
          messages={assistant.messages}
          loading={assistant.loading}
          error={assistant.error}
          entityContext={null}
          mode="chat"
          onSend={assistant.sendMessage}
          onClear={assistant.resetSession}
          onClose={() => setHidden(true)}
          onNewChat={assistant.resetSession}
          onSourceClick={setActiveNoteId}
          toolActivity={assistant.toolActivity}
          sessions={assistant.sessions}
          sessionsLoading={assistant.sessionsLoading}
          onLoadSession={assistant.loadSession}
          onDeleteSession={assistant.deleteSession}
          activeSessionId={assistant.activeSessionId}
        />
      </aside>
      {activeNoteId && (
        <NoteViewer key={activeNoteId} noteId={activeNoteId} onClose={() => setActiveNoteId(null)} />
      )}
    </>
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
      <ShellAssistantHost />
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
        <MealEventsProvider>{wrapped}</MealEventsProvider>
      </AssistantLaunchProvider>
    </SelectionProvider>
  );
}
