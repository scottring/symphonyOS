// src/shell/ShellLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Sun, CalendarRange, CalendarDays, Inbox as InboxIcon, MoreHorizontal } from 'lucide-react';
import { Sidebar, type ViewType } from '@/components/layout/Sidebar';
import { MoreSheet } from '@/components/layout/MoreSheet';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { NewVersionBanner } from '@/components/layout/NewVersionBanner';
import { OmniboxResults } from '@/components/omnibox/OmniboxResults';
import { DomainSwitcher } from '@/components/domain/DomainSwitcher';
import { Toast, ConfirmationToast } from '@/components/toast';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { NotesProvider } from '@/contexts/NotesContext';
import { ListsProvider } from '@/contexts/ListsContext';
import { useAuth } from '@/hooks/useAuth';
import { useMobile } from '@/hooks/useMobile';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant';
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden';
import { useAssistantLaunchRequests, useAssistantLauncher } from '@/contexts/AssistantLaunchContext';
import { useShellChrome } from './useShellChrome';
import { useSelection } from './providers/SelectionProvider';

/**
 * ShellLayout wraps Shell-mounted apps with the Symphony app chrome — the
 * desktop sidebar, the mobile header + bottom nav, the QuickCapture FAB, the
 * domain switcher / AI / help top-bar buttons, pinned items, and the help
 * overlay.
 *
 * Why this exists: App.tsx (legacy mount) renders <AppShell> which wires up
 * the same chrome from App.tsx-local state. Shell-mounted apps bypass App.tsx
 * entirely. ShellLayout reproduces that chrome by sourcing data from the shared
 * hooks directly (see useShellChrome) rather than from props — so the chrome
 * works on every Shell route, including mobile (which previously rendered NO
 * chrome: no capture FAB, no bottom nav).
 *
 * Apps that should render full-bleed (kiosk surfaces like /wall) opt out by
 * setting `chromeless: true` on their AppDef — Shell.tsx skips this wrapper for
 * those apps, so the chrome here only ever wraps non-chromeless apps.
 *
 * NOTE on the AI rail: on Today (desktop) the assistant rail is owned by
 * Shell.tsx's <ShellAssistantHost>. For non-Today views ShellLayout renders its
 * own assistant rail toggled by the top-bar AI button — kept self-contained so
 * Shell.tsx's global DetailPanel model is untouched.
 */

const SIDEBAR_STORAGE_KEY = 'symphony-sidebar-collapsed';

// Mirrors Shell.tsx — the AI rail is owned by ShellAssistantHost on these paths.
const TODAY_PATHS = new Set(['/', '/today', '/tasks-new/today', '/tasks-new']);

/**
 * Derive ViewType from pathname so the Sidebar's active-item highlight
 * works for both legacy and Shell-mounted routes.
 */
function deriveActiveView(pathname: string): ViewType {
  if (pathname.startsWith('/goals')) return 'goals';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/routines')) return 'routines';
  if (pathname === '/contacts') return 'contacts';
  if (pathname.startsWith('/contacts/')) return 'contact-detail';
  if (pathname.startsWith('/meals')) return 'meals';
  if (pathname.startsWith('/agent')) return 'agent';
  if (pathname.startsWith('/us')) return 'us';
  if (pathname === '/morning') return 'morning';
  if (pathname === '/bedtime') return 'bedtime';
  if (pathname === '/inbox' || pathname.endsWith('/tasks-new/inbox')) return 'inbox';
  // /, /today, /tasks-new/today, /tasks-new and /task/:id all live under "today"
  return 'today';
}

interface Props {
  children: ReactNode;
}

/**
 * Inner component — assumes <NotesProvider> + <ListsProvider> are mounted
 * (ShellLayout wraps the tree in both) so useShellChrome's note/list reads work.
 */
function ShellLayoutInner({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile();
  const { user, signOut } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const activeView = useMemo(() => deriveActiveView(location.pathname), [location.pathname]);
  const isToday = TODAY_PATHS.has(location.pathname);

  const { tasks } = useSupabaseTasks();
  const inboxCount = useMemo(
    () => tasks.filter((t) => t.bucket === 'inbox' && !t.completed).length,
    [tasks],
  );

  // Chrome data + handlers, sourced from shared hooks (not props).
  const chrome = useShellChrome();

  // When a detail panel (480px fixed-right) is open, reflow content left so the
  // panel doesn't obscure it.
  const { selection } = useSelection();

  // Mobile/UI chrome state
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Global keyboard shortcuts: ⌘K opens the unibox (Quick Add + search + Ask
  // Symphony); ⌘/ is a legacy alias for the same box; ⌘\ toggles the sidebar.
  // ⌘\ is ignored while typing in a field (so it doesn't fight text entry);
  // ⌘K / ⌘/ work anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k' || key === '/') {
        e.preventDefault();
        setQuickAddOpen((o) => !o);
      } else if (key === '\\') {
        const el = document.activeElement;
        const typing = el instanceof HTMLElement &&
          (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (typing) return;
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Non-Today AI rail (desktop Today's rail is owned by Shell.tsx's
  // ShellAssistantHost; mobile Today has no other surface, so this rail's
  // full-screen mobile overlay covers it too).
  const [chatOpen, setChatOpen] = useState(false);
  const assistant = useSymphonyAssistant({ persistKey: 'symphony_rail' });
  const showAiRail = chatOpen && (!isToday || isMobile);

  // Programmatic launches (unibox "Ask Symphony", Add-to-today…): this host
  // owns every surface except desktop-Today (Shell's ShellAssistantHost).
  const { openAssistant } = useAssistantLauncher();
  const { nonce: launchNonce, consumeSeed } = useAssistantLaunchRequests();
  const seenLaunchNonce = useRef(0);
  useEffect(() => {
    if (launchNonce === 0 || launchNonce === seenLaunchNonce.current) return;
    if (isToday && !isMobile) return;
    seenLaunchNonce.current = launchNonce;
    setChatOpen(true);
    const seed = consumeSeed();
    if (seed && seed.autoSend !== false) void assistant.sendMessage(seed.message);
  }, [launchNonce, isToday, isMobile, consumeSeed, assistant]);

  const handleViewChange = useCallback(
    (view: ViewType) => {
      switch (view) {
        case 'home':
        case 'today':
          navigate('/');
          return;
        case 'inbox':
          navigate('/inbox');
          return;
        case 'goals':
          navigate('/goals');
          return;
        case 'agent':
          navigate('/agent');
          return;
        case 'projects':
          navigate('/projects');
          return;
        case 'routines':
          navigate('/routines');
          return;
        case 'contacts':
        case 'contact-detail':
          navigate('/contacts');
          return;
        case 'meals':
          navigate('/meals/plan');
          return;
        case 'morning':
          navigate('/morning');
          return;
        case 'bedtime':
          navigate('/bedtime');
          return;
        case 'lists':
          navigate('/lists');
          return;
        case 'history':
          navigate('/history');
          return;
        case 'settings':
          navigate('/settings');
          return;
        case 'us':
          navigate('/us');
          return;
        default:
          navigate('/');
      }
    },
    [navigate],
  );

  const onPinNavigate = useCallback(
    (entityType: Parameters<typeof chrome.handlePinNavigate>[0], entityId: string) =>
      chrome.handlePinNavigate(entityType, entityId, navigate),
    [chrome, navigate],
  );

  // The AI rail is shared with main content margin so content isn't covered.
  const rightRailVisible = showAiRail;

  // Today's assistant rail is owned by Shell.tsx (ShellAssistantHost, 420px wide)
  // and its visibility is the shared scratchpad-hidden state. When it's open on
  // Today, reflow the main column left by the rail width instead of letting the
  // fixed overlay cover it. (Detail-pane `selection` takes precedence below,
  // matching ShellAssistantHost which hides the rail while a detail pane is open.)
  const { hidden: scratchpadHidden } = useScratchpadHidden();
  const todayRailVisible = isToday && !scratchpadHidden && !isMobile;

  return (
    <div className="h-screen flex overflow-hidden overflow-x-hidden bg-bg-base w-full max-w-[100vw]">
      {/* "New version available — reload" banner: shows when a newer build
          deployed while this tab stayed open (stale-tab guard). */}
      <NewVersionBanner />

      {/* Desktop sidebar (nordic theme — kinetic sidebar is retired) */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          userEmail={user?.email ?? undefined}
          userName={typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name : undefined}
          onSignOut={signOut}
          activeView={activeView}
          onViewChange={handleViewChange}
          onOpenSearch={() => setQuickAddOpen(true)}
          inboxCount={inboxCount}
          pins={chrome.pins}
          entities={chrome.pinnedEntities}
          onPinNavigate={onPinNavigate}
          onPinMarkAccessed={chrome.markAccessed}
          onPinRefreshStale={chrome.refreshStale}
        />
      )}

      {/* Content frame — uses <div> (not <main>) because individual apps render
          their own <main>. Avoids invalid nested-main HTML. */}
      <div
        className={`relative flex-1 overflow-auto overflow-x-hidden ${isMobile ? '' : 'transition-all duration-300 ease-in-out'}`}
        style={
          isMobile
            ? { paddingBottom: 'calc(2.75rem + env(safe-area-inset-bottom, 0px))' }
            : { marginRight: selection ? '480px' : rightRailVisible ? '380px' : todayRailVisible ? '420px' : '0' }
        }
      >
        {/* Mobile header — logo + sign-out (date nav lives in HomeHeader on Today) */}
        {isMobile && (
          <header
            className="sticky top-0 z-10 bg-transparent px-3 py-1"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex items-center gap-2">
              <img
                src="/symphony-logo.jpg"
                alt="Symphony"
                className="w-7 h-7 rounded-full shrink-0 object-cover"
              />
              <div className="flex-1" />
              <div className="flex items-center gap-0.5 shrink-0">
                {signOut && (
                  <button
                    onClick={signOut}
                    className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                    aria-label="Sign out"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7z"
                        clipRule="evenodd"
                      />
                      <path d="M7 10a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Domain switcher + AI + help on non-Today desktop views.
            On Today these render inside HomeHeader (via AppShellChromeContext). */}
        {!isMobile && activeView !== 'today' && (
          <div className="absolute top-4 right-6 z-20 flex items-center gap-2">
            <DomainSwitcher />
            <button
              onClick={() => setChatOpen((o) => !o)}
              className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all grid place-items-center shadow-card ${
                chatOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
              }`}
              aria-label="AI chat"
              title="AI chat"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        )}

        {children}
      </div>

      {/* QuickCapture FAB — all routes except the agent view (which has its own input) */}
      {activeView !== 'agent' && (
        <QuickCapture
          onAdd={chrome.onQuickAdd}
          onAddRich={chrome.onQuickAddRich}
          onAddNote={chrome.onQuickAddNote}
          projects={chrome.quickAddProjects}
          contacts={chrome.quickAddContacts}
          familyMembers={chrome.quickAddFamilyMembers}
          isOpen={quickAddOpen}
          onOpen={() => setQuickAddOpen(true)}
          onClose={() => setQuickAddOpen(false)}
          resultsSlot={(query, close) => <OmniboxResults query={query} onNavigate={close} />}
          onAskSymphony={(text) => openAssistant({ message: text, autoSend: true })}
        />
      )}

      {/* Non-Today AI rail (desktop). Today's rail is in Shell.tsx. */}
      {showAiRail && !isMobile && (
        <aside
          className="fixed top-0 bottom-0 right-0 w-[380px] bg-bg-elevated border-l border-neutral-200/80 shadow-xl z-20"
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
            onClose={() => setChatOpen(false)}
            onNewChat={assistant.resetSession}
            toolActivity={assistant.toolActivity}
            sessions={assistant.sessions}
            sessionsLoading={assistant.sessionsLoading}
            onLoadSession={assistant.loadSession}
            onDeleteSession={assistant.deleteSession}
            activeSessionId={assistant.activeSessionId}
          />
        </aside>
      )}

      {/* Mobile AI rail — full-screen overlay */}
      {showAiRail && isMobile && (
        <div
          className="fixed inset-0 z-50 bg-bg-elevated"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <ChatPanel
            messages={assistant.messages}
            loading={assistant.loading}
            error={assistant.error}
            entityContext={null}
            mode="chat"
            onSend={assistant.sendMessage}
            onClear={assistant.resetSession}
            onClose={() => setChatOpen(false)}
            onNewChat={assistant.resetSession}
            toolActivity={assistant.toolActivity}
            sessions={assistant.sessions}
            sessionsLoading={assistant.sessionsLoading}
            onLoadSession={assistant.loadSession}
            onDeleteSession={assistant.deleteSession}
            activeSessionId={assistant.activeSessionId}
          />
        </div>
      )}

      {/* Mobile bottom navigation — the rhythm spine: Today · Week · Month ·
          Inbox · More. Horizon tabs route directly (they're URL routes, not
          ViewTypes); active state reads from the pathname. The capture FAB
          floats separately. Season/Year/Someday + the library live in More. */}
      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated/95 backdrop-blur-lg border-t border-neutral-200/50"
          style={{ paddingBottom: 'max(0px, calc(env(safe-area-inset-bottom, 0px) - 8px))' }}
        >
          <div className="flex items-stretch px-1 py-0.5">
            {[
              { label: 'Today', Icon: Sun, route: '/today', active: location.pathname === '/' || location.pathname === '/today' },
              { label: 'Week', Icon: CalendarRange, route: '/week', active: location.pathname.startsWith('/week') },
              { label: 'Month', Icon: CalendarDays, route: '/month', active: location.pathname.startsWith('/month') },
            ].map((tab) => (
              <button
                key={tab.route}
                onClick={() => navigate(tab.route)}
                className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg transition-all ${
                  tab.active ? 'text-accent-600' : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                <tab.Icon className="w-5 h-5" />
                <span className={`text-[0.625rem] font-medium ${tab.active ? 'font-semibold' : ''}`}>{tab.label}</span>
              </button>
            ))}

            {/* Inbox — capture catch-all, with unread badge. */}
            <button
              onClick={() => navigate('/inbox')}
              className={`relative flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg transition-all ${
                location.pathname.startsWith('/inbox') ? 'text-accent-600' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <InboxIcon className="w-5 h-5" />
              <span className={`text-[0.625rem] font-medium ${location.pathname.startsWith('/inbox') ? 'font-semibold' : ''}`}>Inbox</span>
              {inboxCount > 0 && (
                <span className="absolute top-0.5 right-[18%] min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-white text-[9px] font-semibold leading-none">
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
            </button>

            {/* More → opens MoreSheet (the mobile library). */}
            <button
              onClick={() => setMoreSheetOpen(true)}
              className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg transition-all ${
                moreSheetOpen ? 'text-neutral-700' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[0.625rem] font-medium">More</span>
            </button>
          </div>
        </nav>
      )}

      {/* MoreSheet — mobile slide-up menu */}
      {isMobile && (
        <MoreSheet
          isOpen={moreSheetOpen}
          onClose={() => setMoreSheetOpen(false)}
          onNavigate={handleViewChange}
          activeView={activeView}
        />
      )}

      {/* Toast — surfaces QuickCapture note-save feedback */}
      {chrome.toast && (
        <Toast toast={chrome.toast} onDismiss={chrome.dismissToast} />
      )}

      {/* Capture confirmation — "Added to Inbox" with one-tap Today/Tomorrow */}
      {chrome.confirmationToast && (
        <ConfirmationToast
          toast={chrome.confirmationToast}
          onDismiss={chrome.dismissConfirmationToast}
        />
      )}
    </div>
  );
}

export function ShellLayout({ children }: Props) {
  // Wrap the chrome's data needs (note quick-add, pinned lists) in the same
  // contexts the legacy AppShell relied on. Apps that render their own copies
  // (e.g. TasksApp) nest harmlessly inside these.
  return (
    <ListsProvider>
      <NotesProvider>
        <ShellLayoutInner>{children}</ShellLayoutInner>
      </NotesProvider>
    </ListsProvider>
  );
}
