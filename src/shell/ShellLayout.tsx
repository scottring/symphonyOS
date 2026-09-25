import { PlanNavigation, usePlanDestination, planPeriodForPath, MobilePlanControlsContext } from '@/components/layout/PlanNavigation';
import { requestPlanFromPaper } from '@/lib/planFromPaperSignal';
import { DesktopNavigation, DesktopControlsContext } from '@/components/layout/DesktopNavigation';
import { ReferenceListsProvider, useReferenceLists } from '@/components/reference/ReferenceListsContext';
import { ReferenceListsDock } from '@/components/reference/ReferenceLists';
import { pinIsOnPage } from '@/components/reference/periodsOnPage';
import { DesktopFooter, DesktopFooterActionContext } from '@/components/layout/DesktopFooter';
// src/shell/ShellLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Repeat, CalendarRange, Inbox as InboxIcon, MoreHorizontal, Plus } from 'lucide-react';
import { useTextEntryActive } from '@/hooks/useKeyboardInset';
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
import { setCurrentAccount } from '@/lib/currentAccount';
import { useMobile } from '@/hooks/useMobile';
import { useDomain } from '@/hooks/useDomain';
import { filterInboxTasksForLayers } from '@/lib/today/domainFilter';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox';
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant';
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden';
import { useAssistantLaunchRequests, useAssistantLauncher } from '@/contexts/AssistantLaunchContext';
import { useShellChrome } from './useShellChrome';
import { useSelection } from './providers/SelectionProvider';
import { MOBILE_TAB_BAR_HEIGHT } from './mobileChrome';
import { SideColumn, SIDE_COLUMN_WIDTH, type SidePane } from './SideColumn';
import { PhonePaneSwitch } from './PhonePaneSwitch';
import { NoteViewer } from '@/components/chat/NoteViewer';
import { PlaceBand } from '@/components/place/PlaceBand';
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
 * NOTE on the right column: on desktop, Details and AI share ONE column
 * (SideColumn) on every page — one assistant, one conversation, and switching
 * panes keeps both mounted. Phones keep the full-screen detail panel and a
 * full-screen assistant overlay.
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
  const typing = useTextEntryActive();
  const planDestination = usePlanDestination();
  const { user, signOut } = useAuth();
  // Module caches that are not components — the planning calendar behind the
  // day tiles — key their data on who is signed in. The shell is the one
  // place that knows, once.
  useEffect(() => { setCurrentAccount(user?.id ?? null); }, [user?.id]);

  const [desktopControls, setDesktopControls] = useState<HTMLDivElement | null>(null);
  const [mobilePlanControls, setMobilePlanControls] = useState<HTMLDivElement | null>(null);
  const [desktopFooterAction, setDesktopFooterAction] = useState<HTMLDivElement | null>(null);

  const references = useReferenceLists();
  const activeView = useMemo(() => deriveActiveView(location.pathname), [location.pathname]);

  const { tasks } = useSupabaseTasks();
  const { unreadCount: discussionsUnread } = useDiscussionInbox();
  // The badge MUST mirror what the Inbox actually renders. It used to count
  // every inbox task regardless of the active domain layers, so an item in an
  // unchecked layer showed as "1 to triage" in the chrome while the Inbox —
  // and Focus mode — said "Inbox zero" (launch rehearsal, 2026-09-04). It
  // then drifted the other way when the Inbox began always showing untagged
  // captures; both now use the one selector.
  const { layers } = useDomain();
  const inboxCount = useMemo(
    () => filterInboxTasksForLayers(tasks, layers).filter((t) => t.bucket === 'inbox' && !t.completed).length,
    [tasks, layers],
  );

  // Chrome data + handlers, sourced from shared hooks (not props).
  const chrome = useShellChrome();

  // The selected item opens Details in the right column.
  const { selection, clearSelection } = useSelection();

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

  // One assistant for the whole shell: the desktop column's AI pane and the
  // phone overlay show the same conversation. On desktop its visibility is
  // the persisted rail preference (useScratchpadHidden — the masthead's AI
  // button toggles the same state); phones open it per launch.
  const assistant = useSymphonyAssistant({ persistKey: 'symphony_rail' });
  const { hidden: aiHidden, setHidden: setAiHidden } = useScratchpadHidden();
  const [phoneChatOpen, setPhoneChatOpen] = useState(false);
  const [pane, setPane] = useState<SidePane>('details');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const aiOpen = !isMobile && !aiHidden;
  // A new selection brings Details to the front.
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  useEffect(() => { if (selectionKey) setPane('details'); }, [selectionKey]);
  const showPane = useCallback((next: SidePane) => {
    if (next === 'ai') setAiHidden(false);
    setPane(next);
  }, [setAiHidden]);

  // Programmatic launches (unibox "Ask Symphony", Add-to-today…).
  const { openAssistant } = useAssistantLauncher();
  const { nonce: launchNonce, consumeSeed } = useAssistantLaunchRequests();
  const seenLaunchNonce = useRef(0);
  useEffect(() => {
    if (launchNonce === 0 || launchNonce === seenLaunchNonce.current) return;
    seenLaunchNonce.current = launchNonce;
    if (isMobile) setPhoneChatOpen(true);
    else showPane('ai');
    const seed = consumeSeed();
    if (seed && seed.autoSend !== false) void assistant.sendMessage(seed.message);
  }, [launchNonce, isMobile, consumeSeed, assistant, showPane]);

  // Closing the More sheet returns focus to its tab, not to <body>.
  const moreTabRef = useRef<HTMLButtonElement>(null);
  const closeMoreSheet = useCallback(() => {
    setMoreSheetOpen(false);
    moreTabRef.current?.focus();
  }, []);

  // Pinned lists sit on the LEFT, so they no longer compete with the right
  // column: both stay open while the page keeps a readable width between
  // them. Only when it would not do the column still wins, and the lists
  // return when it closes. The dock column is reserved only when a pin
  // actually draws here, so the page centres in the width left.
  const viewportWidth = useViewportWidth();
  const columnOpen = !isMobile && (!!selection || aiOpen);
  const paneWidth = columnOpen ? SIDE_COLUMN_WIDTH : 0;
  const referencesFit = paneWidth === 0 || viewportWidth - paneWidth - REFERENCE_DOCK_WIDTH >= MIN_PAGE_WITH_REFERENCES;
  const referencesPaused = paneWidth > 0 && !referencesFit;
  const referencesVisible = !isMobile && referencesFit
    && !!references?.pins.some((pin) => !pinIsOnPage(location.pathname, pin.kind));

  return (
    <DesktopControlsContext.Provider value={desktopControls}>
    <MobilePlanControlsContext.Provider value={mobilePlanControls}>
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
            : { marginRight: `${paneWidth}px` }
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
        {/* Phone Today folds the domain lens into its one Filters control in
            the tab row, so this header row would only repeat it. */}
        {isMobile && !planPeriodForPath(location.pathname) && (
          // Rides in the top-right corner, level with the page title, rather
          // than spending a row of its own above it.
          <header
            className="phone-page-lens absolute right-0 top-0 z-10 px-4 pt-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
          >
            <DomainSwitcher />
          </header>
        )}

        {isMobile ? (
          <div>
            <PlanNavigation mobile mobileControlsRef={setMobilePlanControls} />
            <div className="min-w-0">{children}</div>
          </div>
        ) : (
          // Desktop: navigation, page, and footer share one centred column —
          // centred in the window, or in the space left beside a side pane or
          // the pinned reference lists.
          <>
          {/* Your place, as a shallow landscape behind the navigation band. */}
          <PlaceBand />
          <div className={`desktop-workspace relative${referencesVisible ? ' has-references' : ''}`}>
            <div className="desktop-workspace-nav">
        <DesktopNavigation inboxCount={inboxCount} discussionsUnread={discussionsUnread}
          onSearch={() => setQuickAddOpen(true)} onQuickAdd={() => setQuickAddOpen(true)} onSignOut={signOut}
          userName={user?.user_metadata?.name ?? user?.email}
          paused={referencesPaused} controlsRef={setDesktopControls}
          auxiliaryControls={!pageOwnsFilterChrome(location.pathname) && (
          <div className="flex items-center gap-2">
            <DomainSwitcher />
            <button
              onClick={() => setAiHidden(aiOpen)}
              className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all grid place-items-center shadow-card ${
                aiOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
              }`}
              aria-label="AI chat"
              title="AI chat"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        )} />
            </div>
            <div className="desktop-workspace-page min-w-0"><PlanNavigation paused={referencesPaused} />
              <SideColumn
                hasSelection={!!selection}
                aiOpen={aiOpen}
                pane={pane}
                onPaneChange={showPane}
                onCloseDetails={clearSelection}
                onCloseAi={() => setAiHidden(true)}
                ai={
                  <ChatPanel
                    messages={assistant.messages}
                    loading={assistant.loading}
                    error={assistant.error}
                    entityContext={null}
                    mode="chat"
                    onSend={assistant.sendMessage}
                    onClear={assistant.resetSession}
                    onClose={() => setAiHidden(true)}
                    onNewChat={assistant.resetSession}
                    onSourceClick={setActiveNoteId}
                    toolActivity={assistant.toolActivity}
                    sessions={assistant.sessions}
                    sessionsLoading={assistant.sessionsLoading}
                    onLoadSession={assistant.loadSession}
                    onDeleteSession={assistant.deleteSession}
                    activeSessionId={assistant.activeSessionId}
                  />
                }
              >
                {children}
              </SideColumn>
            </div>
            {referencesVisible && <div className="desktop-workspace-dock"><ReferenceListsDock /></div>}
            <DesktopFooter actionRef={setDesktopFooterAction} />
          </div>
          </>
        )}
      </div>

      {/* QuickCapture FAB — all routes except the agent view (which has its own input) */}
      {activeView !== 'agent' && (
        <QuickCapture
          // Phones add through the dock's + (and the capture bar); desktop
          // through ⌘K and the navigation's search button.
          showFab={false}
          onAdd={chrome.onQuickAdd}
          onAddRich={chrome.onQuickAddRich}
          onAddNote={chrome.onQuickAddNote}
          eventCalendarName={chrome.eventCalendarName}
          onPlanFromPaper={() => { if (!requestPlanFromPaper()) navigate('/today') }}
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

      {/* Mobile AI rail — full-screen overlay */}
      {phoneChatOpen && isMobile && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-bg-elevated"
          // Taps in here are not a tap "outside" the Details panel beneath.
          data-panel-keepalive
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* With an item open, the same Details | AI switch as desktop:
              Details is still mounted underneath, edits and all. */}
          {selection && <PhonePaneSwitch active="ai" onChange={(p) => { if (p === 'details') setPhoneChatOpen(false); }} />}
          <div className="min-h-0 flex-1">
          <ChatPanel
            messages={assistant.messages}
            loading={assistant.loading}
            error={assistant.error}
            entityContext={null}
            mode="chat"
            onSend={assistant.sendMessage}
            onClear={assistant.resetSession}
            onClose={() => setPhoneChatOpen(false)}
            onNewChat={assistant.resetSession}
            toolActivity={assistant.toolActivity}
            sessions={assistant.sessions}
            sessionsLoading={assistant.sessionsLoading}
            onLoadSession={assistant.loadSession}
            onDeleteSession={assistant.deleteSession}
            activeSessionId={assistant.activeSessionId}
          />
          </div>
        </div>
      )}

      {/* The native dock: Planner · Inbox · + · Routines · More. While a text
          field has focus the keyboard owns the bottom edge, so the dock steps
          aside and the capture bar sits on the keyboard (as on iOS). */}
      {isMobile && !typing && (
        <nav className="phone-dock" aria-label="Main">
          <div className="phone-dock-row">
            <button
              type="button"
              className="phone-dock-tab"
              onClick={() => navigate(planDestination)}
              aria-current={planPeriodForPath(location.pathname) ? 'page' : undefined}
            >
              <CalendarRange aria-hidden="true" />
              <span>Planner</span>
            </button>
            <button
              type="button"
              className="phone-dock-tab"
              onClick={() => navigate('/inbox')}
              aria-current={location.pathname.startsWith('/inbox') ? 'page' : undefined}
              aria-label={`Inbox${inboxCount ? `, ${inboxCount} ${inboxCount === 1 ? 'item' : 'items'}` : ''}`}
            >
              <InboxIcon aria-hidden="true" />
              <span>Inbox</span>
              {inboxCount > 0 && (
                <span className="phone-dock-badge" aria-hidden="true">{inboxCount > 99 ? '99+' : inboxCount}</span>
              )}
            </button>
            <div className="phone-dock-add-slot">
              <button type="button" className="phone-dock-add" onClick={() => setQuickAddOpen(true)} aria-label="Add">
                <Plus aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="phone-dock-tab"
              onClick={() => navigate('/routines')}
              aria-current={location.pathname.startsWith('/routines') ? 'page' : undefined}
            >
              <Repeat aria-hidden="true" />
              <span>Routines</span>
            </button>
            <button
              type="button"
              ref={moreTabRef}
              className="phone-dock-tab"
              onClick={() => setMoreSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreSheetOpen}
            >
              <MoreHorizontal aria-hidden="true" />
              <span>More</span>
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
          // Opens the conversation without sending anything.
          onAskSymphony={() => { setMoreSheetOpen(false); setPhoneChatOpen(true); }}
        />
      )}

      {activeNoteId && (
        <NoteViewer key={activeNoteId} noteId={activeNoteId} onClose={() => setActiveNoteId(null)} />
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
    </MobilePlanControlsContext.Provider>
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
