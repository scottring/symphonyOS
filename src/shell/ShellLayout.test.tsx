import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { DomainProvider } from '@/hooks/useDomain'
import { DomainGateProvider } from '@/components/domain/DomainGate'
import { DesktopPageControls } from '@/components/layout/DesktopNavigation'
import { DesktopFooterAction } from '@/components/layout/DesktopFooter'
import { deriveActiveView, pageOwnsFilterChrome, ShellLayout } from './ShellLayout'

// Regression test for the House sidebar link: it navigated to '/home' but
// deriveActiveView had no case for that prefix, so it fell through to the
// 'today' default — House never highlighted and its inline room list never
// auto-expanded (Sidebar.tsx's `libraryActive`/`homeAppActive` both read
// off `activeView`).
describe('pageOwnsFilterChrome', () => {
  it('leaves filters to pages whose masthead renders them', () => {
    for (const p of ['/', '/today', '/week', '/month', '/season', '/year', '/inbox', '/discussions', '/task/abc']) {
      expect(pageOwnsFilterChrome(p)).toBe(true)
    }
  })
  it('gives every other page the nav domain switcher — Someday filters by domain', () => {
    for (const p of ['/someday', '/notes', '/lists', '/history', '/documents', '/routines', '/contacts', '/weekly']) {
      expect(pageOwnsFilterChrome(p)).toBe(false)
    }
  })
})

describe('deriveActiveView', () => {
  it('derives home-app for /home and its sub-routes', () => {
    expect(deriveActiveView('/home')).toBe('home-app')
    expect(deriveActiveView('/home/space/abc123')).toBe('home-app')
    expect(deriveActiveView('/home/asset/xyz789')).toBe('home-app')
  })

  it('still derives the other known views correctly (no regression)', () => {
    expect(deriveActiveView('/goals')).toBe('goals')
    // /projects is hidden (2026-09-02) — it redirects to /today, so nothing
    // ever asks this function about it.
    expect(deriveActiveView('/projects')).toBe('today')
    expect(deriveActiveView('/routines')).toBe('routines')
    expect(deriveActiveView('/contacts')).toBe('contacts')
    expect(deriveActiveView('/contacts/abc')).toBe('contact-detail')
    expect(deriveActiveView('/meals/plan')).toBe('meals')
    expect(deriveActiveView('/inbox')).toBe('inbox')
    expect(deriveActiveView('/')).toBe('today')
    expect(deriveActiveView('/today')).toBe('today')
  })
})

// ---------------------------------------------------------------------------
// Rendered chrome. Everything ShellLayout sources from shared hooks is stubbed
// so the test exercises only the layout's own branching (mobile vs desktop).
// ---------------------------------------------------------------------------

const mobileState = vi.hoisted(() => ({ isMobile: false }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mobileState.isMobile }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, signOut: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({
  tasks: [], loading: false, updateTask: vi.fn(), updateTasksBulk: vi.fn(), pushTask: vi.fn(), toggleTask: vi.fn(),
}) }))
vi.mock('@/hooks/useScratchpadHidden', () => ({ useScratchpadHidden: () => ({ hidden: true }) }))
vi.mock('@/hooks/useSymphonyAssistant', () => ({
  useSymphonyAssistant: () => ({
    messages: [], loading: false, error: null, sendMessage: vi.fn(), resetSession: vi.fn(),
    toolActivity: [], sessions: [], sessionsLoading: false, loadSession: vi.fn(),
    deleteSession: vi.fn(), activeSessionId: null,
  }),
}))
vi.mock('./useShellChrome', () => ({
  useShellChrome: () => ({
    onQuickAdd: vi.fn(), onQuickAddRich: vi.fn(), onQuickAddNote: vi.fn(),
    quickAddProjects: [], quickAddContacts: [], quickAddFamilyMembers: [],
    toast: null, dismissToast: vi.fn(), confirmationToast: null, dismissConfirmationToast: vi.fn(),
  }),
}))
const selectionState = vi.hoisted(() => ({ selection: null as unknown }))
vi.mock('./providers/SelectionProvider', () => ({ useSelection: () => ({ selection: selectionState.selection }), useSelectionOptional: () => null }))

vi.mock('@/contexts/NotesContext', () => ({ NotesProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/contexts/ListsContext', () => ({ ListsProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/contexts/PinsContext', () => ({ PinsProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))

vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
vi.mock('@/components/layout/MoreSheet', () => ({ MoreSheet: () => null }))
vi.mock('@/components/layout/QuickCapture', () => ({ QuickCapture: ({ showFab, isOpen }: { showFab?: boolean; isOpen?: boolean }) => <div data-testid="quick-capture" data-fab={String(showFab)} data-open={String(!!isOpen)} /> }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ loading: false, error: false, plan: {
  carried: [], scheduled: [], available: [], week: [], month: [], counts: { scheduled: 0, available: 0 },
  offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
} }) }))
vi.mock('@/hooks/usePlanActions', () => ({ usePlanActions: () => ({}) }))
vi.mock('@/components/layout/NewVersionBanner', () => ({ NewVersionBanner: () => null }))
vi.mock('@/components/omnibox/OmniboxResults', () => ({ OmniboxResults: () => null }))
vi.mock('@/components/chat/ChatPanel', () => ({ ChatPanel: () => null }))
vi.mock('@/components/toast', () => ({ Toast: () => null, ConfirmationToast: () => null, ToastLiveRegion: () => null }))

function renderAt(path: string, children: ReactNode = <div data-testid="app-content" />) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DomainProvider>
        <DomainGateProvider>
          <ShellLayout>{children}</ShellLayout>
        </DomainGateProvider>
      </DomainProvider>
    </MemoryRouter>,
  )
}

// The switcher used to live only behind `!isMobile` here and `hidden md:flex`
// in HomeHeader — phone users were stuck on whatever layer was last chosen on
// desktop. It now rides the mobile header, which every Shell route renders.
describe('ShellLayout domain switcher', () => {
  beforeEach(() => localStorage.clear())

  it.each(['/today', '/week', '/inbox'])('renders the domain switcher in the mobile header on %s', (path) => {
    mobileState.isMobile = true
    renderAt(path)
    expect(screen.getByRole('button', { name: 'Layers: All' })).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('renders exactly one switcher on mobile Today', () => {
    mobileState.isMobile = true
    renderAt('/today')
    expect(screen.getAllByRole('button', { name: /^Layers:/ })).toHaveLength(1)
  })

  it('on desktop keeps the switcher off Today and Inbox (their masthead cards own it) and on for other views', () => {
    mobileState.isMobile = false
    const { unmount } = renderAt('/today')
    expect(screen.queryByRole('button', { name: /^Layers:/ })).not.toBeInTheDocument()
    unmount()
    const second = renderAt('/inbox')
    expect(screen.queryByRole('button', { name: /^Layers:/ })).not.toBeInTheDocument()
    second.unmount()
    renderAt('/routines')
    expect(screen.getByRole('button', { name: 'Layers: All' })).toBeInTheDocument()
  })
})


// The brief: a task detail or the assistant takes precedence over the pinned
// reference panels, and the pins come BACK when that panel closes.
describe('References and the side panels', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })

  it('yields the reference panel to a task detail and returns it when the detail closes', () => {
    sessionStorage.setItem('symphony-reference-lists:anonymous', JSON.stringify([{ kind: 'week', date: new Date().toISOString() }]))
    const open = renderAt('/today')
    expect(screen.getByRole('complementary', { name: 'Pinned reference lists' })).toBeInTheDocument()
    expect(screen.queryByText(/Lists return when you close/)).not.toBeInTheDocument()
    open.unmount()

    selectionState.selection = { kind: 'task', id: 't1' }
    const withDetail = renderAt('/today')
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    // The pin is kept and says so, rather than reading as having been dropped.
    expect(screen.getByText(/Lists return when you close the side panel/)).toBeInTheDocument()
    withDetail.unmount()

    selectionState.selection = null
    renderAt('/today')
    expect(screen.getByRole('complementary', { name: 'Pinned reference lists' })).toBeInTheDocument()
    sessionStorage.clear(); localStorage.removeItem('symphony-plan-period')
  })
})

describe('Phone execution chrome', () => {
  it('opens Plan directly on a phone and keeps every period within Plan', () => {
    mobileState.isMobile = true
    localStorage.removeItem('symphony-plan-period')
    renderAt('/today')
    fireEvent.click(screen.getByRole('button', { name: 'Planner' }))
    expect(screen.getByRole('button', { name: 'Planner' })).toHaveAttribute('aria-current', 'page')
    for (const label of ['Week', 'Month', 'Season', 'Year']) {
      fireEvent.click(screen.getByRole('link', { name: label }))
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    }
    fireEvent.click(screen.getByRole('link', { name: 'Today' }))
    expect(screen.getByRole('navigation', { name: 'Planning period' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Planner' }))
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps references off the phone even when desktop lists were pinned', () => {
    mobileState.isMobile = true
    sessionStorage.setItem('symphony-reference-lists:anonymous', JSON.stringify([{ kind: 'week', date: new Date().toISOString() }]))
    renderAt('/today')
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin month list' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
    sessionStorage.clear(); localStorage.removeItem('symphony-plan-period')
  })
})


describe('Consolidated desktop navigation', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })
  it('separates destinations from the task chooser and keeps period links within Plan', () => {
    // Today draws its own Choose control on its "For today" heading
    // (2026-09-22); the page-tools chooser is every other page's door.
    renderAt('/notes')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const chooser = screen.getByRole('button', { name: 'Shelves' })
    expect(nav).not.toContainElement(chooser)
    expect(screen.queryByRole('navigation', { name: 'Planning period' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Planner' }))
    expect(screen.getByRole('navigation', { name: 'Planning period' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('link', { name: 'Month' }))
    expect(screen.getByRole('link', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('link', { name: 'Routines' }))
    fireEvent.click(screen.getByRole('link', { name: 'Planner' }))
    expect(screen.getByRole('link', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
  })
  it('places page-specific controls in the consolidated navigation', () => {
    renderAt('/today', <DesktopPageControls><button>Page options</button></DesktopPageControls>)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toContainElement(screen.getByRole('button', { name: 'Page options' }))
    expect(screen.getAllByRole('button', { name: 'Page options' })).toHaveLength(1)
  })
  it('closes a menu with Escape and returns focus to its trigger', () => {
    renderAt('/today')
    const more = screen.getByRole('button', { name: /^More/ })
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: 'Plan from paper' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Plan from paper' })).not.toBeInTheDocument()
    expect(more).toHaveFocus()
  })
})

describe('Centred desktop workspace and footer', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })

  it('keeps navigation, page, and footer in one column, with a dock column only while a list draws', () => {
    sessionStorage.setItem('symphony-reference-lists:anonymous', JSON.stringify([{ kind: 'week', date: new Date().toISOString() }]))
    const today = renderAt('/today')
    const workspace = screen.getByRole('contentinfo').parentElement!
    expect(workspace).toHaveClass('desktop-workspace', 'has-references')
    expect(workspace).toContainElement(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(workspace).toContainElement(screen.getByTestId('app-content'))
    today.unmount()
    // /week already shows the week list, so no empty dock column is reserved.
    renderAt('/week')
    expect(screen.getByRole('contentinfo').parentElement).not.toHaveClass('has-references')
  })

  it('carries only the page-supplied action at left, so other routes offer no review', () => {
    const today = renderAt('/today', <DesktopFooterAction><button>Review today</button></DesktopFooterAction>)
    expect(screen.getByRole('contentinfo')).toContainElement(screen.getByRole('button', { name: 'Review today' }))
    expect(screen.getAllByRole('button', { name: 'Review today' })).toHaveLength(1)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Symphony')
    today.unmount()
    renderAt('/routines')
    expect(screen.queryByRole('button', { name: /Review/ })).not.toBeInTheDocument()
  })

  it('opens keyboard shortcuts and help as dialogs that close with Escape and return focus', () => {
    renderAt('/routines')
    const shortcuts = screen.getByRole('button', { name: 'Keyboard shortcuts' })
    shortcuts.focus()
    fireEvent.click(shortcuts)
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('⌘K')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(shortcuts).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders no desktop footer on phones', () => {
    mobileState.isMobile = true
    renderAt('/today')
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
  })
})

describe('Grouped More menu and desktop capture', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })

  it('groups More into Organize, Home, and Reference with Plan from paper on its own line', () => {
    renderAt('/today')
    fireEvent.click(screen.getByRole('button', { name: /^More/ }))
    const plan = screen.getByRole('group', { name: 'Organize' })
    expect(plan).toContainElement(screen.getByRole('button', { name: 'Someday' }))
    expect(screen.getByRole('group', { name: 'Home' })).toContainElement(screen.getByRole('button', { name: 'Meals' }))
    expect(screen.getByRole('group', { name: 'Reference' })).toContainElement(screen.getByRole('button', { name: 'History' }))
    expect(plan).not.toContainElement(screen.getByRole('button', { name: 'Plan from paper' }))
  })

  it('shows the floating capture button on phones only', () => {
    const desktop = renderAt('/today')
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-fab', 'false')
    desktop.unmount()
    mobileState.isMobile = true
    renderAt('/today')
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-fab', 'true')
  })

  it('hides the floating capture button over a full-screen detail panel on phones', () => {
    mobileState.isMobile = true
    selectionState.selection = { kind: 'task', id: 't1' }
    renderAt('/today')
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-fab', 'false')
  })
})

describe('Pinned lists on the left', () => {
  const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
  beforeEach(() => {
    mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period')
    sessionStorage.setItem('symphony-reference-lists:anonymous', JSON.stringify([{ kind: 'week', date: new Date().toISOString() }]))
  })
  afterEach(() => { setWidth(1024); selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })

  it('keeps the lists open beside a detail pane when the page still has room', () => {
    setWidth(1600)
    selectionState.selection = { kind: 'task', id: 't1' }
    renderAt('/today')
    expect(screen.getByRole('complementary', { name: 'Pinned reference lists' })).toBeInTheDocument()
    expect(screen.queryByText(/Lists return when you close the side panel/)).not.toBeInTheDocument()
  })

  it('lets the detail pane win when the page would be squeezed', () => {
    setWidth(1280)
    selectionState.selection = { kind: 'task', id: 't1' }
    renderAt('/today')
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    expect(screen.getByText(/Lists return when you close the side panel/)).toBeInTheDocument()
  })
})


describe('Capture and the Today pin from every desktop page', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })

  it.each(['/today', '/week', '/month', '/notes', '/inbox'])('%s has a visible Add button that opens the ⌘K capture', (path) => {
    renderAt(path)
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-open', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Add — ⌘K' }))
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-open', 'true')
  })

  it('⌘K still toggles the same capture', () => {
    renderAt('/week')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-open', 'true')
  })

  it('the Planning panel opens beside any page from its labelled button, and closes the same way', () => {
    renderAt('/notes')
    const toggle = screen.getByRole('button', { name: 'Shelves' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveTextContent('Shelves')
    fireEvent.click(toggle)
    expect(screen.getByRole('region', { name: 'Shelves' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close shelves', pressed: true }))
    expect(screen.queryByRole('region', { name: 'Shelves' })).not.toBeInTheDocument()
    // Today is still one destination.
    expect(screen.getAllByRole('link', { name: 'Planner' })).toHaveLength(1)
  })
})
