import { useState, useCallback, useRef, useEffect, Suspense, type ReactNode } from 'react'
import { PanelRightOpen, Sparkles } from 'lucide-react'
import { AppShellChromeContext } from '@/contexts/AppShellChromeContext'
import { TodayRail } from '@/components/today/TodayRail'
import { useScratchpadHidden } from '@/hooks/useScratchpadHidden'
import { Sidebar, type ViewType } from './Sidebar'
import { SidebarKinetic } from './SidebarKinetic'
import { MoreSheet } from './MoreSheet'
import { QuickCapture } from './QuickCapture'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useMobile } from '@/hooks/useMobile'
import { useTheme } from '@/hooks/useTheme'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { HelpPanel as OnboardingHelpPanel } from '@/components/lazy'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'
import type { ChatMessage, EntityContext } from '@/hooks/useChat'
import type { ChatSession } from '@/hooks/useChatSessions'

export type PanelTab = 'details' | 'ai'

interface EntityData {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists: Array<{ id: string; name: string }>
}

interface AppShellProps {
  children: ReactNode
  panel?: ReactNode
  sidebarCollapsed: boolean
  onSidebarToggle: () => void
  panelOpen: boolean
  focusModeOpen?: boolean
  userEmail?: string
  userName?: string
  onSignOut?: () => void
  onQuickAdd?: (title: string) => void
  // Rich add with parsed fields (for natural language parser)
  onQuickAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
    context?: 'work' | 'family' | 'personal'
    assignedMemberIds?: string[]
  }) => void
  // Note creation
  onQuickAddNote?: (data: {
    content: string
    topicName?: string
  }) => void
  // Context for QuickCapture parser
  quickAddProjects?: Array<{ id: string; name: string }>
  quickAddContacts?: Array<{ id: string; name: string }>
  quickAddFamilyMembers?: Array<{ id: string; name: string }>
  quickAddOpen?: boolean
  onOpenQuickAdd?: () => void
  onCloseQuickAdd?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenSearch?: () => void
  // Mobile header: when activeView is 'today', the date + prev/next arrows
  // render in the app header (instead of the standalone TodayHeader on mobile).
  viewedDate?: Date
  onDateChange?: (d: Date) => void
  // Pinned items props
  pins?: PinnedItem[]
  entities?: EntityData
  /** Full FamilyMember[] for the Today rail's Family Snapshot panel.
   *  Distinct from quickAddFamilyMembers (slim {id,name} version for QuickCapture). */
  railFamilyMembers?: import('@/types/family').FamilyMember[]
  /** Opens a task's detail view — used by the rail's For Discussion panel. */
  onRailSelectTask?: (taskId: string) => void
  /** Opens a family member's detail page — used by the rail's Family Snapshot. */
  onOpenMember?: (id: string) => void
  onPinNavigate?: (entityType: PinnableEntityType, entityId: string) => void
  onPinMarkAccessed?: (entityType: PinnableEntityType, entityId: string) => void
  onPinRefreshStale?: (id: string) => void
  // Panel dismiss (click-outside-to-close)
  onDismissPanel?: () => void
  // Chat props
  chatOpen?: boolean
  onChatOpenChange?: (open: boolean) => void
  chatMessages?: ChatMessage[]
  chatLoading?: boolean
  chatError?: string | null
  chatEntityContext?: EntityContext | null
  chatMode?: import('@/hooks/useChat').ChatMode
  onChatSend?: (message: string) => void
  onChatClear?: () => void
  onChatSourceClick?: (noteId: string) => void
  onChatSaveToVault?: (title: string, content: string) => Promise<boolean>
  onChatAddTask?: (title: string, destination: 'inbox' | 'today') => void
  // Chat history
  chatSessions?: ChatSession[]
  chatSessionsLoading?: boolean
  onChatLoadSession?: (session: ChatSession) => void
  onChatDeleteSession?: (sessionId: string) => void
  onChatNewChat?: () => void
  activeChatSessionId?: string | null
  // Tabbed panel state
  activePanelTab?: PanelTab
  onPanelTabChange?: (tab: PanelTab) => void
}

export function AppShell({
  children,
  panel,
  sidebarCollapsed,
  onSidebarToggle,
  panelOpen,
  focusModeOpen = false,
  userEmail,
  userName,
  onSignOut,
  onQuickAdd,
  onQuickAddRich,
  onQuickAddNote,
  quickAddProjects,
  quickAddContacts,
  quickAddFamilyMembers,
  quickAddOpen = false,
  onOpenQuickAdd,
  onCloseQuickAdd,
  activeView,
  onViewChange,
  onOpenSearch,
  viewedDate,
  onDateChange,
  pins,
  entities,
  railFamilyMembers = [],
  onRailSelectTask,
  onOpenMember,
  onPinNavigate,
  onPinMarkAccessed,
  onPinRefreshStale,
  onDismissPanel,
  chatOpen = false,
  onChatOpenChange,
  chatMessages = [],
  chatLoading = false,
  chatError = null,
  chatEntityContext = null,
  chatMode,
  onChatSend,
  onChatClear,
  onChatSourceClick,
  onChatSaveToVault,
  onChatAddTask,
  chatSessions = [],
  chatSessionsLoading = false,
  onChatLoadSession,
  onChatDeleteSession,
  onChatNewChat,
  activeChatSessionId,
  activePanelTab = 'details',
  onPanelTabChange,
}: AppShellProps) {
  const isMobile = useMobile()
  const { theme } = useTheme()
  const { hidden: scratchpadHidden, setHidden: setScratchpadHidden } = useScratchpadHidden()
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)
  const setChatOpen = useCallback((open: boolean) => onChatOpenChange?.(open), [onChatOpenChange])
  const mainRef = useRef<HTMLElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)
  const handleHelpOpenChange = useCallback((open: boolean) => setHelpOpen(open), [])

  // Track window width for three-panel mode
  // Breakpoint: sidebar(240) + min content(360) + detail(380) + chat(380) ≈ 1360px
  const [isWideScreen, setIsWideScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1400 : false
  )
  useEffect(() => {
    const handleResize = () => setIsWideScreen(window.innerWidth >= 1400)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Whether the right panel column is visible (detail or chat or both active)
  const rightPanelVisible = panelOpen || chatOpen
  const bothPanelsActive = panelOpen && chatOpen
  // Scratchpad fills the right rail on Today when no detail/chat panel is open (desktop only)
  // Also requires the user hasn't hidden it.
  const scratchpadSlot = !isMobile && !rightPanelVisible && activeView === 'today'
  const scratchpadVisible = scratchpadSlot && !scratchpadHidden
  // Wide screen: show both panels side-by-side. Narrow: tabbed in single column.
  const useThreePanelLayout = isWideScreen && bothPanelsActive
  // Show tabs only when both are active AND screen is too narrow for side-by-side
  const showPanelTabs = bothPanelsActive && !useThreePanelLayout

  // Click-outside handler: clicking on main content dismisses the panel
  const handleMainClick = useCallback((e: React.MouseEvent) => {
    // Only dismiss if click is directly on main or its non-interactive children
    // Don't dismiss if user clicked on a button, link, input, or data-selectable item
    const target = e.target as HTMLElement
    if (target.closest('[data-selectable]') || target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea') || target.closest('[role="button"]')) {
      return
    }
    onDismissPanel?.()
  }, [onDismissPanel])

  return (
    <div className="h-screen flex overflow-hidden overflow-x-hidden bg-bg-base w-full max-w-[100vw]">
      {/* Sidebar - hidden on mobile */}
      {!isMobile && theme === 'kinetic' && (
        <SidebarKinetic
          collapsed={sidebarCollapsed}
          onToggle={onSidebarToggle}
          userEmail={userEmail}
          onSignOut={onSignOut}
          activeView={activeView}
          onViewChange={onViewChange}
          onOpenSearch={onOpenSearch}
          pins={pins}
          entities={entities}
          onPinNavigate={onPinNavigate}
          onPinMarkAccessed={onPinMarkAccessed}
          onPinRefreshStale={onPinRefreshStale}
        />
      )}
      {!isMobile && theme === 'nordic' && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={onSidebarToggle}
          userEmail={userEmail}
          userName={userName}
          onSignOut={onSignOut}
          activeView={activeView}
          onViewChange={onViewChange}
          onOpenSearch={onOpenSearch}
          inboxCount={entities?.tasks.filter(t => t.bucket === 'inbox' && !t.completed).length}
          pins={pins}
          entities={entities}
          onPinNavigate={onPinNavigate}
          onPinMarkAccessed={onPinMarkAccessed}
          onPinRefreshStale={onPinRefreshStale}
        />
      )}

      {/* Main content area */}
      <main
        ref={mainRef}
        className={`
          relative flex-1 overflow-auto overflow-x-hidden scrollbar-none
          transition-all duration-300 ease-in-out
          ${isMobile ? 'pb-14' : ''}
        `}
        style={isMobile
          ? { paddingBottom: 'calc(2.75rem + env(safe-area-inset-bottom, 0px))' }
          : {
              marginRight: useThreePanelLayout && focusModeOpen ? '1140px'  // 380 + 380 + 380
                : useThreePanelLayout ? '760px'                             // 380 + 380
                : rightPanelVisible && focusModeOpen ? '760px'
                : focusModeOpen ? '380px'
                : rightPanelVisible ? '380px'
                : scratchpadVisible ? '380px'
                : '0'
            }
        }
        onClick={!isMobile ? handleMainClick : undefined}
      >
        {/* Mobile header — three columns: tree logo / centered date with arrows / icon cluster.
            On non-Today views, the center column stays empty so the icons still anchor right. */}
        {isMobile && (
          <header className="sticky top-0 z-10 bg-transparent px-3 py-1"
                  style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center gap-2">
              <img
                src="/symphony-logo.jpg"
                alt="Symphony"
                className="w-7 h-7 rounded-full shrink-0 object-cover"
              />

              <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
                <button
                  aria-label="Previous day"
                  onClick={() => {
                    if (!viewedDate || !onDateChange) return
                    const n = new Date(viewedDate); n.setDate(n.getDate() - 1); onDateChange(n)
                  }}
                  className="text-xl font-semibold leading-none text-neutral-700 hover:text-neutral-900 px-2 py-1 shrink-0 select-none"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                >
                  {'<'}
                </button>
                <span className="font-display text-lg font-semibold text-neutral-900 whitespace-nowrap">
                  {viewedDate ? viewedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
                </span>
                <button
                  aria-label="Next day"
                  onClick={() => {
                    if (!viewedDate || !onDateChange) return
                    const n = new Date(viewedDate); n.setDate(n.getDate() + 1); onDateChange(n)
                  }}
                  className="text-xl font-semibold leading-none text-neutral-700 hover:text-neutral-900 px-2 py-1 shrink-0 select-none"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                >
                  {'>'}
                </button>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {onOpenSearch && (
                  <button
                    onClick={onOpenSearch}
                    className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                    aria-label="Search"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
                    aria-label="Sign out"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7z" clipRule="evenodd" />
                      <path d="M7 10a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </header>
        )}
        {/* Domain switcher + AI + help on non-Today views */}
        {!isMobile && activeView !== 'today' && (
          <div className="absolute top-4 right-6 z-20 flex items-center gap-2">
            <DomainSwitcher />
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all grid place-items-center shadow-card ${
                chatOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
              }`}
              aria-label="AI chat"
              title="AI chat"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              ref={helpButtonRef}
              onClick={() => setHelpOpen(o => !o)}
              className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all font-display italic text-[16px] grid place-items-center shadow-card ${
                helpOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
              }`}
              aria-label="Help"
            >?</button>
          </div>
        )}
        {/* On Today view, AI + help buttons are rendered inside HomeHeader (via AppShellChromeContext).
            No absolute buttons needed here — HomeHeader's flex row handles alignment. */}
        <AppShellChromeContext.Provider value={{
          chatOpen,
          onChatOpenChange: setChatOpen,
          helpOpen,
          onHelpOpenChange: handleHelpOpenChange,
          helpButtonRef,
        }}>
          {children}
        </AppShellChromeContext.Provider>
      </main>

      {/* Quick Capture - FAB shown on all pages when panel is closed (except agent view which has its own input) */}
      {onQuickAdd && activeView !== 'agent' && (
        <QuickCapture
          onAdd={onQuickAdd}
          onAddRich={onQuickAddRich}
          onAddNote={onQuickAddNote}
          projects={quickAddProjects}
          contacts={quickAddContacts}
          familyMembers={quickAddFamilyMembers}
          isOpen={quickAddOpen}
          onOpen={onOpenQuickAdd}
          onClose={onCloseQuickAdd}
          showFab={!(isMobile && activeView === 'today') && !(isMobile && panelOpen)}
        />
      )}

      {/* Right panel column — tabbed: Details + AI share one 380px column */}
      {isMobile ? (
        <>
          {/* Mobile: detail panel as full-screen overlay */}
          <div
            className={`
              fixed inset-0 z-50 bg-bg-elevated
              transform transition-transform duration-300 ease-out
              ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
              safe-top safe-bottom
            `}
          >
            {panel}
          </div>
          {/* Mobile: chat panel as full-screen overlay */}
          {onChatSend && (
            <div
              className={`
                fixed inset-0 z-50 bg-white
                transform transition-transform duration-300 ease-out
                ${chatOpen ? 'translate-x-0' : 'translate-x-full'}
              `}
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <ChatPanel
                messages={chatMessages}
                loading={chatLoading}
                error={chatError}
                entityContext={chatEntityContext}
                mode={chatMode}
                onSend={onChatSend}
                onClear={onChatClear ?? (() => {})}
                onClose={() => setChatOpen(false)}
                onSourceClick={onChatSourceClick}
                onSaveToVault={onChatSaveToVault}
                onAddTask={onChatAddTask}
                sessions={chatSessions}
                sessionsLoading={chatSessionsLoading}
                onLoadSession={onChatLoadSession}
                onDeleteSession={onChatDeleteSession}
                onNewChat={onChatNewChat}
                activeSessionId={activeChatSessionId}
              />
            </div>
          )}
        </>
      ) : useThreePanelLayout ? (
        /* Wide screen: detail and chat as separate side-by-side panels */
        <>
          {/* Detail panel — left of pair */}
          <aside
            className={`
              fixed top-0 bottom-0 w-[380px]
              bg-bg-elevated border-l border-neutral-200/80
              transition-transform duration-300 ease-out
              ${panelOpen ? 'translate-x-0' : 'translate-x-full'}
              shadow-xl z-20
            `}
            style={{ right: (focusModeOpen ? 380 : 0) + 380 }}
          >
            {panel}
          </aside>

          {/* Chat panel — rightmost */}
          {onChatSend && (
            <aside
              className={`
                fixed top-0 bottom-0 w-[380px]
                bg-bg-elevated border-l border-neutral-200/80
                transition-transform duration-300 ease-out
                ${chatOpen ? 'translate-x-0' : 'translate-x-full'}
                shadow-xl z-20
              `}
              style={{ right: focusModeOpen ? 380 : 0 }}
            >
              <ChatPanel
                messages={chatMessages}
                loading={chatLoading}
                error={chatError}
                entityContext={chatEntityContext}
                mode={chatMode}
                onSend={onChatSend}
                onClear={onChatClear ?? (() => {})}
                onClose={() => setChatOpen(false)}
                onSourceClick={onChatSourceClick}
                onSaveToVault={onChatSaveToVault}
                onAddTask={onChatAddTask}
                sessions={chatSessions}
                sessionsLoading={chatSessionsLoading}
                onLoadSession={onChatLoadSession}
                onDeleteSession={onChatDeleteSession}
                onNewChat={onChatNewChat}
                activeSessionId={activeChatSessionId}
              />
            </aside>
          )}
        </>
      ) : (
        /* Narrow screen or single panel: tabbed single column */
        <aside
          className={`
            fixed top-0 bottom-0 w-[380px]
            bg-bg-elevated border-l border-neutral-200/80
            transition-transform duration-300 ease-out
            ${rightPanelVisible ? 'translate-x-0' : 'translate-x-full'}
            shadow-xl z-20 flex flex-col
          `}
          style={{ right: focusModeOpen ? '380px' : '0' }}
        >
          {/* Tabs — shown when both detail and chat are active on narrow screens */}
          {showPanelTabs && (
            <div className="flex border-b border-neutral-200/80 bg-bg-elevated shrink-0">
              <button
                onClick={() => onPanelTabChange?.('details')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  activePanelTab === 'details'
                    ? 'text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                Details
                {activePanelTab === 'details' && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full" />
                )}
              </button>
              <button
                onClick={() => onPanelTabChange?.('ai')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  activePanelTab === 'ai'
                    ? 'text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                AI
                {activePanelTab === 'ai' && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full" />
                )}
              </button>
            </div>
          )}

          {/* Panel content — detail or chat, flex child fills remaining aside height */}
          {((!showPanelTabs && panelOpen) || (showPanelTabs && activePanelTab === 'details')) && panelOpen && (
            <div className="flex-1 min-h-0 overflow-hidden">
              {panel}
            </div>
          )}

          {onChatSend && ((!showPanelTabs && chatOpen && !panelOpen) || (showPanelTabs && activePanelTab === 'ai')) && chatOpen && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatPanel
                messages={chatMessages}
                loading={chatLoading}
                error={chatError}
                entityContext={chatEntityContext}
                mode={chatMode}
                onSend={onChatSend}
                onClear={onChatClear ?? (() => {})}
                onClose={() => setChatOpen(false)}
                onSourceClick={onChatSourceClick}
                onSaveToVault={onChatSaveToVault}
                onAddTask={onChatAddTask}
                sessions={chatSessions}
                sessionsLoading={chatSessionsLoading}
                onLoadSession={onChatLoadSession}
                onDeleteSession={onChatDeleteSession}
                onNewChat={onChatNewChat}
                activeSessionId={activeChatSessionId}
              />
            </div>
          )}
        </aside>
      )}

      {/* Today rail — right rail on Today when no detail/chat panel is open.
          Hosts ambient panels (At a Glance, future Family Snapshot + Active
          Projects) above the Scratchpad. */}
      {scratchpadVisible && (
        <aside
          className="fixed top-0 bottom-0 right-0 w-[380px] bg-bg-base border-l border-neutral-200/80 z-10 p-4"
          aria-label="Today rail"
        >
          <TodayRail
            tasks={entities?.tasks ?? []}
            projects={entities?.projects ?? []}
            familyMembers={railFamilyMembers}
            onSelectProject={(id) => {
              // Open the specific project. Falls back to the projects list
              // if the deep-link handler isn't wired.
              if (onPinNavigate) onPinNavigate('project', id)
              else onViewChange('projects')
            }}
            onViewAllProjects={() => onViewChange('projects')}
            onSelectMember={(id) => {
              if (onOpenMember) onOpenMember(id)
              else onViewChange('home-app')
            }}
            onViewAllFamily={() => onViewChange('settings') /* no family-list view yet; Settings manages members */}
            onSelectTask={(id) => onRailSelectTask?.(id)}
          />
        </aside>
      )}

      {/* Show-scratchpad tab — slim right-edge affordance when scratchpad is hidden */}
      {scratchpadSlot && scratchpadHidden && (
        <button
          onClick={() => setScratchpadHidden(false)}
          aria-label="Show scratchpad"
          className="fixed right-0 top-1/2 -translate-y-1/2 z-10 bg-bg-elevated border border-neutral-200 rounded-l-lg px-1.5 py-3 text-neutral-400 hover:text-neutral-600 shadow-card transition-colors"
        >
          <PanelRightOpen size={16} />
        </button>
      )}

      {/* Mobile bottom navigation — 4 tabs */}
      {isMobile && !panelOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-elevated/95 backdrop-blur-lg border-t border-neutral-200/50"
             style={{ paddingBottom: 'max(0px, calc(env(safe-area-inset-bottom, 0px) - 8px))' }}>
          <div className="flex items-stretch px-1 py-0.5">
            {/* Agent — only visible to Scott */}
            {(userEmail === 'smkaufman@gmail.com' || userEmail === 'scott.kaufman@stacksdata.com') && (
              <button
                onClick={() => onViewChange('agent')}
                className={`
                  flex-1 min-w-0 flex flex-col items-center gap-0 px-1 py-1 rounded-lg transition-all
                  ${activeView === 'agent'
                    ? 'text-primary-600'
                    : 'text-neutral-400 hover:text-neutral-600'
                  }
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
                <span className={`text-[0.625rem] font-medium ${activeView === 'agent' ? 'font-semibold' : ''}`}>Michael</span>
              </button>
            )}

            {/* Today */}
            <button
              onClick={() => onViewChange('today')}
              className={`
                flex-1 min-w-0 flex flex-col items-center gap-0 px-1 py-1 rounded-lg transition-all
                ${activeView === 'today'
                  ? 'text-accent-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span className={`text-[0.625rem] font-medium ${activeView === 'today' ? 'font-semibold' : ''}`}>Today</span>
            </button>

            {/* Projects */}
            <button
              onClick={() => onViewChange('projects')}
              className={`
                flex-1 min-w-0 flex flex-col items-center gap-0 px-1 py-1 rounded-lg transition-all
                ${activeView === 'projects'
                  ? 'text-blue-600'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className={`text-[0.625rem] font-medium ${activeView === 'projects' ? 'font-semibold' : ''}`}>Projects</span>
            </button>

            {/* More → opens MoreSheet */}
            <button
              onClick={() => setMoreSheetOpen(true)}
              className={`
                relative flex-1 min-w-0 flex flex-col items-center gap-0 px-1 py-1 rounded-lg transition-all
                ${moreSheetOpen
                  ? 'text-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
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
          onNavigate={onViewChange}
          activeView={activeView}
        />
      )}

      {/* Help panel — floating, anchored to the ? button in the topbar */}
      {helpOpen && (
        <Suspense fallback={null}>
          <OnboardingHelpPanel
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            anchorRef={helpButtonRef}
          />
        </Suspense>
      )}

    </div>
  )
}
