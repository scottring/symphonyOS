import { PlanNavigation, usePlanDestination, planPeriodForPath } from '@/components/layout/PlanNavigation';
import { DesktopNavigation, DesktopControlsContext } from '@/components/layout/DesktopNavigation';
import { ReferenceListsProvider, useReferenceLists } from '@/components/reference/ReferenceListsContext';
import { ReferenceListsDock } from '@/components/reference/ReferenceLists';
import { pinIsOnPage } from '@/components/reference/periodsOnPage';
import { DesktopFooter, DesktopFooterActionContext } from '@/components/layout/DesktopFooter';
// src/shell/ShellLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Repeat, CalendarRange, Inbox as InboxIcon, MoreHorizontal } from 'lucide-react';
import { type ViewType } from '@/components/layout/Sidebar';
import { MoreSheet } from '@/components/layout/MoreSheet';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { NewVersionBanner } from '@/components/layout/NewVersionBanner';
import { OmniboxResults } from '@/components/omnibox/OmniboxResults';
import { DomainSwitcher } from '@/components/domain/DomainSwitcher';
import { Toast, ConfirmationToast, ToastLiveRegion } from '@/components/toast';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { NotesProvider } from '@/contexts/NotesContext';
import { ListsProvider } from '@/contexts/ListsContext';
import { PinsProvider } from '@/contexts/PinsContext';
import { useAuth } from '@/hooks/useAuth';
import { useMobile } from '@/hooks/useMobile';
import { useDomain } from '@/hooks/useDomain';
import { filterTasksForLayers } from '@/lib/today/domainFilter';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox';
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant';
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden';
import { useAssistantLaunchRequests, useAssistantLauncher } from '@/contexts/AssistantLaunchContext';
import { useShellChrome } from './useShellChrome';
import { useSelection } from './providers/SelectionProvider';
import { MOBILE_TAB_BAR_HEIGHT } from './mobileChrome';
import { onQuickAddRequest } from '@/lib/quickAddSignal';

/**
 * ShellLayout wraps Shell-mounted apps with the Symphony app chrome — the
 * desktop page navigation, the mobile header + bottom nav, the QuickCapture FAB, the
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

// Left reference dock at its widest, and the narrowest page worth keeping
// beside it when a right-hand pane is also open.
const REFERENCE_DOCK_WIDTH = 340;
const MIN_PAGE_WITH_REFERENCES = 640;

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// Mirrors Shell.tsx — the AI rail is owned by ShellAssistantHost on these paths.
const TODAY_PATHS = new Set(['/', '/today', '/tasks-new/today', '/tasks-new']);

/**
 * Derive ViewType from pathname so the Sidebar's active-item highlight
 * works for both legacy and Shell-mounted routes.
 */
export function deriveActiveView(pathname: string): ViewType {
  if (pathname.startsWith('/goals')) return 'goals';
  // /projects is hidden (2026-09-02) and redirects to /today in main.tsx, so
  // it never reaches here; see the note in Sidebar.tsx.
  if (pathname.startsWith('/routines')) return 'routines';
  if (pathname === '/contacts') return 'contacts';
  if (pathname.startsWith('/contacts/')) return 'contact-detail';
  if (pathname.startsWith('/meals')) return 'meals';
  if (pathname.startsWith('/agent')) return 'agent';
  if (pathname === '/inbox' || pathname.endsWith('/tasks-new/inbox')) return 'inbox';
  if (pathname.startsWith('/home')) return 'home-app';
  // /, /today, /tasks-new/today, /tasks-new and /task/:id all live under "today"
  return 'today';
}

/**
 * Pages that render their own domain/person filters and assistant entry in
 * their masthead. Every other page gets them in the desktop nav — previously
 * any path deriveActiveView didn't know (Someday, Notes, Lists, History…)
 * fell through to 'today' and silently lost the domain switcher, even though
 * Someday filters by it.
 */
const OWN_CHROME_PATHS = ['/', '/today', '/week', '/month', '/season', '/year', '/inbox', '/discussions', '/tasks-new'];
export function pageOwnsFilterChrome(pathname: string): boolean {
  return OWN_CHROME_PATHS.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)))
    || pathname.startsWith('/task/');
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
  const planDestination = usePlanDestination();
  const { user, signOut } = useAuth();

  const [desktopControls, setDesktopControls] = useState<HTMLDivElement | null>(null);
  const [desktopFooterAction, setDesktopFooterAction] = useState<HTMLDivElement | null>(null);

  const references = useReferenceLists();
  const activeView = useMemo(() => deriveActiveView(location.pathname), [location.pathname]);
  const isToday = TODAY_PATHS.has(location.pathname);

  const { tasks } = useSupabaseTasks();
  const { unreadCount: discussionsUnread } = useDiscussionInbox();
  // The badge MUST mirror what the Inbox actually renders. It used to count
  // every inbox task regardless of the active domain layers, so an item in an
  // unchecked layer showed as "1 to triage" in the chrome while the Inbox —
  // and Focus mode — said "Inbox zero" (launch rehearsal, 2026-09-04).
  const { layers } = useDomain();
  const inboxCount = useMemo(
    () => filterTasksForLayers(tasks, layers).filter((t) => t.bucket === 'inbox' && !t.completed).length,
    [tasks, layers],
  );

  // Chrome data + handlers, sourced from shared hooks (not props).
  const chrome = useShellChrome();

  // When a detail panel (480px fixed-right) is open, reflow content left so the
  // panel doesn't obscure it.
  const { selection } = useSelection();

  // Mobile/UI chrome state
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // "Add task" from the Planning panel (dock or sheet) asks the shell to open
  // the same unibox ⌘K opens — one add box, wherever it is asked for.
  useEffect(() => onQuickAddRequest(() => setQuickAddOpen(true)), []);

  // Global keyboard shortcuts: ⌘K opens the unibox (Quick Add + search + Ask
  // Symphony); ⌘/ is a legacy alias. Both work anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k' || key === '/') {
        e.preventDefault();
        setQuickAddOpen((o) => !o);

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

  // Closing the More sheet returns focus to its tab, not to <body>.
  const moreTabRef = useRef<HTMLButtonElement>(null);
  const closeMoreSheet = useCallback(() => {
    setMoreSheetOpen(false);
    moreTabRef.current?.focus();
  }, []);

  // The AI rail is shared with main content margin so content isn't covered.
  const rightRailVisible = showAiRail;

  // Today's assistant rail is owned by Shell.tsx (ShellAssistantHost, 420px wide)
  // and its visibility is the shared scratchpad-hidden state. When it's open on
  // Today, reflow the main column left by the rail width instead of letting the
  // fixed overlay cover it. (Detail-pane `selection` takes precedence below,
  // matching ShellAssistantHost which hides the rail while a detail pane is open.)
  const { hidden: scratchpadHidden } = useScratchpadHidden();
  const todayRailVisible = isToday && !scratchpadHidden && !isMobile;
  // Pinned lists sit on the LEFT, so they no longer compete with the detail
  // and AI panes on the right: both stay open while the page keeps a readable
  // width between them. Only when it would not do the panes still win, and
  // the lists return when the pane closes. The dock column is reserved only
  // when a pin actually draws here, so the page centres in the width left.
  const viewportWidth = useViewportWidth();
  const paneWidth = selection ? 480 : rightRailVisible ? 380 : todayRailVisible ? 420 : 0;
  const referencesFit = paneWidth === 0 || viewportWidth - paneWidth - REFERENCE_DOCK_WIDTH >= MIN_PAGE_WITH_REFERENCES;
  const referencesPaused = paneWidth > 0 && !referencesFit;
  const referencesVisible = !isMobile && referencesFit
    && !!references?.pins.some((pin) => !pinIsOnPage(location.pathname, pin.kind));

  return (
    <DesktopControlsContext.Provider value={desktopControls}>
    <DesktopFooterActionContext.Provider value={desktopFooterAction}>
    <div className="h-screen flex overflow-hidden overflow-x-hidden bg-bg-base w-full max-w-[100vw]">
      {/* "New version available — reload" banner: shows when a newer build
          deployed while this tab stayed open (stale-tab guard). */}
      <NewVersionBanner />

      {/* Content frame — uses <div> (not <main>) because individual apps render
          their own <main>. Avoids invalid nested-main HTML. */}
      <div
        className={`relative flex-1 overflow-auto overflow-x-hidden ${isMobile ? '' : 'transition-all duration-300 ease-in-out'}`}
        style={
          isMobile
            ? {
                // Must clear the fixed bottom tab bar below (MOBILE_TAB_BAR_HEIGHT),
                // plus a little slack, plus the safe-area inset the bar itself sits
                // above. See mobileChrome.ts — this used to be a separate, smaller
                // hardcoded literal (2.75rem) that silently fell out of sync with
                // the bar's actual height and clipped AttentionLine.
                paddingBottom: `calc(${MOBILE_TAB_BAR_HEIGHT} + 0.5rem + env(safe-area-inset-bottom, 0px))`,
              }
            : { marginRight: selection ? '480px' : rightRailVisible ? '380px' : todayRailVisible ? '420px' : '0' }
        }
      >
        {/* Mobile header — domain switcher (date nav lives in
            HomeHeader on Today). This header is the one piece of chrome every
            mobile Shell route renders, so the switcher lives here and nowhere
            else on phones: HomeHeader hides its copy below md, and the desktop
            top-right cluster further down is gated on !isMobile. Sign out is
            NOT here: an unlabelled one-tap door on the page people live in
            (walkthrough 2026-09-21, C-P1) — it lives in Settings, with a
            confirm. */}
        {isMobile && (
          <header
            className="sticky top-0 z-10 bg-transparent px-3 py-1"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1" />
              <div className="flex items-center gap-1 shrink-0">
                <DomainSwitcher />
              </div>
            </div>
          </header>
        )}

        {isMobile ? (
          <div>
            <PlanNavigation mobile />
            <div className="min-w-0">{children}</div>
          </div>
        ) : (
          // Desktop: navigation, page, and footer share one centred column —
          // centred in the window, or in the space left beside a side pane or
          // the pinned reference lists.
          <div className={`desktop-workspace${referencesVisible ? ' has-references' : ''}`}>
            <div className="desktop-workspace-nav">
        <DesktopNavigation inboxCount={inboxCount} discussionsUnread={discussionsUnread}
          onSearch={() => setQuickAddOpen(true)} onQuickAdd={() => setQuickAddOpen(true)} onSignOut={signOut}
          userName={user?.user_metadata?.name ?? user?.email}
          paused={referencesPaused} controlsRef={setDesktopControls}
          auxiliaryControls={!pageOwnsFilterChrome(location.pathname) && (
          <div className="flex items-center gap-2">
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
        )} />
            </div>
            <div className="desktop-workspace-page min-w-0"><PlanNavigation paused={referencesPaused} />{children}</div>
            {referencesVisible && <div className="desktop-workspace-dock"><ReferenceListsDock /></div>}
            <DesktopFooter actionRef={setDesktopFooterAction} />
          </div>
        )}
      </div>

      {/* QuickCapture FAB — all routes except the agent view (which has its own input) */}
      {activeView !== 'agent' && (
        <QuickCapture
          // Desktop captures through ⌘K and the navigation's search button.
          showFab={isMobile}
          onAdd={chrome.onQuickAdd}
          onAddRich={chrome.onQuickAddRich}
          onAddNote={chrome.onQuickAddNote}
          eventCalendarName={chrome.eventCalendarName}
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

      {/* The same four destinations on desktop and phone: Today, Plan, Inbox, More. */}
      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated/95 backdrop-blur-lg border-t border-neutral-200/50"
          style={{ paddingBottom: 'max(0px, calc(env(safe-area-inset-bottom, 0px) - 8px))' }}
        >
          <div className="flex items-stretch px-1 py-0.5">
            {[
              { label: 'Planner', Icon: CalendarRange, route: planDestination, active: !!planPeriodForPath(location.pathname) },
              { label: 'Routines', Icon: Repeat, route: '/routines', active: location.pathname.startsWith('/routines') },
            ].map((tab) => (
              <button
                key={tab.route}
                onClick={() => navigate(tab.route)}
                aria-current={tab.active ? 'page' : undefined}
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
              aria-current={location.pathname.startsWith('/inbox') ? 'page' : undefined}
              aria-label={`Inbox${inboxCount ? `, ${inboxCount} items` : ''}`}
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
              ref={moreTabRef}
              onClick={() => setMoreSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreSheetOpen}
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
          onClose={closeMoreSheet}
          discussionsUnread={discussionsUnread}
        />
      )}

      {/* Always mounted, so toast text is announced to screen readers. */}
      <ToastLiveRegion
        message={chrome.toast?.message ?? chrome.confirmationToast?.message}
        urgent={chrome.toast?.type === 'error'}
      />

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
    </DesktopFooterActionContext.Provider>
    </DesktopControlsContext.Provider>
  );
}

export function ShellLayout({ children }: Props) {
  const { user } = useAuth();
  // Wrap the chrome's data needs (note quick-add, pinned lists) in the same
  // contexts the legacy AppShell relied on. Apps that render their own copies
  // (e.g. TasksApp) nest harmlessly inside these.
  return (
    <ListsProvider>
      <NotesProvider>
        <PinsProvider>
          <ReferenceListsProvider key={user?.id ?? "anonymous"} userId={user?.id ?? "anonymous"}><ShellLayoutInner>{children}</ShellLayoutInner></ReferenceListsProvider>
        </PinsProvider>
      </NotesProvider>
    </ListsProvider>
  );
}
