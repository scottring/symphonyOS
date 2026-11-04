import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { DomainProvider } from '@/hooks/useDomain'
import { DomainGateProvider } from '@/components/domain/DomainGate'
import { DesktopPageControls } from '@/components/layout/DesktopNavigation'
import { deriveActiveView, pageOwnsFilterChrome, ShellLayout } from './ShellLayout'
import { useMemo } from 'react'
import { useGuidedSessionRegistration, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { AssistantLaunchProvider, useAssistantLauncher } from '@/contexts/AssistantLaunchContext'

vi.mock('@/lib/canvas/reviewedChange', async () => {
  const {applyChangeSet} = await import('@/lib/canvas/applyChangeSet')
  return {createReviewedWriter:()=>({client:undefined}),applyReviewedChange:applyChangeSet}
})

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
const tasksState = vi.hoisted(() => ({ addTask: vi.fn(async () => 'new1'), updateTask: vi.fn(async () => true), letGoTasks: [] as unknown[] }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({
  tasks: [], letGoTasks: tasksState.letGoTasks, loading: false, updateTask: tasksState.updateTask, updateTasksBulk: vi.fn(), pushTask: vi.fn(), toggleTask: vi.fn(),
  addTask: tasksState.addTask, deleteTask: vi.fn(), refetch: vi.fn(),
}) }))
const aiState = vi.hoisted(() => ({ hidden: true }))
// Stateful like the real preference, so opening and closing the pane shows.
vi.mock('@/hooks/useScratchpadHidden', async () => {
  const { useState } = await import('react')
  return { useScratchpadHidden: () => { const [hidden, setHidden] = useState(aiState.hidden); return { hidden, setHidden } } }
})
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ routines: [], deleteRoutine: vi.fn(), updateRoutine: vi.fn(), refetch: vi.fn(), addRoutine: vi.fn() }) }))
const assistantState = vi.hoisted(() => ({
  observer: null as null | import('@/hooks/useSymphonyAssistant').AssistantTurnObserver, sendMessage: vi.fn(),
  options: undefined as undefined | import('@/hooks/useSymphonyAssistant').UseSymphonyAssistantOptions,
  openThread: vi.fn(async (..._args: unknown[]) => {}), resetSession: vi.fn(), newThread: vi.fn(),
  messages: [] as import('@/types/chat').ChatMessage[],
}))
vi.mock('@/hooks/useSymphonyAssistant', () => ({
  useSymphonyAssistant: (options?: import('@/hooks/useSymphonyAssistant').UseSymphonyAssistantOptions) => (assistantState.observer = options?.turnObserver ?? null, assistantState.options = options, {
    messages: assistantState.messages, loading: false, error: null, sendMessage: assistantState.sendMessage, resetSession: assistantState.resetSession, openThread: assistantState.openThread, newThread: assistantState.newThread,
    toolActivity: [], sessions: [], sessionsLoading: false, loadSession: vi.fn(),
    deleteSession: vi.fn(), activeSessionId: null,
  }),
}))
const voiceState = vi.hoisted(() => ({ access: false, active: false, sendText: vi.fn(() => true), stop: vi.fn() }))
vi.mock('@/hooks/useWorkspaceVoiceAccess', () => ({ useWorkspaceVoiceAccess: () => voiceState.access }))
vi.mock('@/hooks/useWorkspaceVoice', () => ({ useWorkspaceVoice: () => ({
  active: voiceState.active, status: voiceState.active ? 'live' : 'idle', turn: 'off', heard: '', reply: '',
  start: vi.fn(), stop: voiceState.stop, mute: vi.fn(), talk: vi.fn(), done: vi.fn(), sendText: voiceState.sendText,
}) }))
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
vi.mock('@/components/layout/MoreSheet', () => ({ MoreSheet: ({ isOpen, onAskSymphony }: { isOpen: boolean; onAskSymphony?: () => void }) => (isOpen && onAskSymphony ? <button type="button" onClick={onAskSymphony}>Ask Symphony</button> : null) }))
vi.mock('@/components/layout/QuickCapture', () => ({ QuickCapture: ({ showFab, isOpen, rightInset }: { showFab?: boolean; isOpen?: boolean; rightInset?: number }) => <div data-testid="quick-capture" data-fab={String(showFab)} data-right-inset={rightInset} data-open={String(!!isOpen)} /> }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ loading: false, error: false, plan: {
  carried: [], scheduled: [], available: [], week: [], month: [], counts: { scheduled: 0, available: 0 },
  offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
} }) }))
vi.mock('@/hooks/usePlanActions', () => ({ usePlanActions: () => ({}) }))
vi.mock('@/components/layout/NewVersionBanner', () => ({ NewVersionBanner: () => null }))
vi.mock('@/components/omnibox/OmniboxResults', () => ({ OmniboxResults: () => null }))
vi.mock('@/components/chat/ChatPanel', () => ({ ChatPanel: ({ beforeInput }: { beforeInput?: ReactNode }) => <><textarea aria-label="Conversation draft" />{beforeInput}</> }))
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

  it.each(['/week', '/inbox'])('renders the domain switcher in the mobile header on %s', (path) => {
    mobileState.isMobile = true
    renderAt(path)
    expect(screen.getByRole('button', { name: 'Areas: All' })).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })

  it('leaves mobile Today to its own Filters control, so the header row is gone', () => {
    mobileState.isMobile = true
    renderAt('/today')
    expect(screen.queryByRole('button', { name: /^Areas:/ })).not.toBeInTheDocument()
  })

  // Scott, 2026-09-30: area + assistant sit in the top bar on every page —
  // Today and Inbox included — and the pages no longer repeat them.
  it('on desktop the top bar carries the area switcher on every view', () => {
    mobileState.isMobile = false
    for (const path of ['/today', '/inbox', '/routines']) {
      const view = renderAt(path)
      expect(screen.getAllByRole('button', { name: /^Areas:/ })).toHaveLength(1)
      view.unmount()
    }
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
  it('carries Home, Today and Plan in the phone dock, with the current one marked', () => {
    mobileState.isMobile = true
    localStorage.removeItem('symphony-plan-period')
    renderAt('/today')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    // Plan opens the week; its title menu reaches the other horizons.
    fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
    expect(screen.getByRole('button', { name: 'Week. Switch horizon' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(nav).getByRole('button', { name: 'Home' }))
    expect(within(nav).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Plan' })).not.toHaveAttribute('aria-current')
    fireEvent.click(within(nav).getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('button', { name: 'Today. Switch horizon' })).toBeInTheDocument()
  })

  it('keeps references off the phone even when desktop lists were pinned', () => {
    mobileState.isMobile = true
    sessionStorage.setItem('symphony-reference-lists:anonymous', JSON.stringify([{ kind: 'week', date: new Date().toISOString() }]))
    renderAt('/today')
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin month list' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today. Switch horizon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^More/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
    sessionStorage.clear(); localStorage.removeItem('symphony-plan-period')
  })
})


describe('Phone AI beside Details', () => {
  afterEach(() => { selectionState.selection = null; mobileState.isMobile = false })

  it('opens from More without an item, with no Details switch to show', () => {
    mobileState.isMobile = true
    renderAt('/today')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    expect(screen.queryByRole('tablist', { name: 'Side panel' })).not.toBeInTheDocument()
  })

  it('retains an unsent message when switching back to details and reopening', () => {
    mobileState.isMobile = true
    selectionState.selection = { kind: 'task', id: 't1' }
    renderAt('/today?view=alongside')
    const open = () => { fireEvent.click(screen.getByRole('button', {name:'More'})); fireEvent.click(screen.getByRole('button', {name:'Ask Symphony'})) }
    open()
    fireEvent.change(screen.getByRole('textbox', {name:'Message Symphony'}), {target:{value:'Keep this wording'}})
    expect(screen.getByTestId('app-content').closest('[inert]')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', {name:'Details'}))
    expect(screen.getByTestId('app-content').closest('[inert]')).toBeNull()
    open()
    expect(screen.getByRole('textbox', {name:'Message Symphony'})).toHaveValue('Keep this wording')
  })

  it('switches back to the item, which stays open underneath', () => {
    mobileState.isMobile = true
    selectionState.selection = { kind: 'task', id: 't1' }
    renderAt('/today')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.queryByRole('tablist', { name: 'Side panel' })).not.toBeInTheDocument()
    expect(selectionState.selection).toEqual({ kind: 'task', id: 't1' })
  })
})

describe('Consolidated desktop navigation', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear(); localStorage.removeItem('symphony-plan-period') })
  it('the horizon rail is the main way between horizons, on every page (2026-09-28)', () => {
    // No "Planner" and no "Routines" in the top row: the numbered rail is the
    // navigation, shown on pages that are no horizon too, with none marked.
    renderAt('/notes')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Planner' })).not.toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Planning period' })
    expect(rail.querySelector('[aria-current="page"]')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Season' }))
    expect(screen.getByRole('link', { name: 'Season' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('link', { name: 'Today' }))
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    // Routines is on the bar, after the rail, not under More (2026-10-24).
    const main = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(main).getByRole('link', { name: 'Routines' })).toHaveAttribute('href', expect.stringMatching(/^\/routines/))
    fireEvent.click(screen.getByRole('button', { name: /^More/ }))
    expect(screen.queryByRole('button', { name: 'Routines' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Someday' })).toBeInTheDocument()
    fireEvent.click(within(main).getByRole('link', { name: 'Routines' }))
    expect(within(main).getByRole('link', { name: 'Routines' })).toHaveAttribute('aria-current', 'page')
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
    // The footer rides in the sticky ground block (2026-09-28), one level down.
    const workspace = screen.getByRole('navigation', { name: 'Main navigation' }).closest('.desktop-workspace') as HTMLElement
    expect(workspace).toHaveClass('desktop-workspace', 'has-references')
    expect(workspace).toContainElement(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(workspace).toContainElement(screen.getByTestId('app-content'))
    today.unmount()
    // /week already shows the week list, so no empty dock column is reserved.
    renderAt('/week')
    expect(screen.getByRole('navigation', { name: 'Main navigation' }).closest('.desktop-workspace')).not.toHaveClass('has-references')
  })

  it('has no footer bar: the landscape at the foot of the page stays clear (2026-10-02)', () => {
    renderAt('/today')
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(document.querySelector('.desktop-ground')).toBeNull()
  })

  it('opens keyboard shortcuts and help from the ☰ menu; Escape closes and focus returns to ☰', () => {
    renderAt('/routines')
    const more = screen.getByRole('button', { name: 'More' })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('⌘K')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(more).toHaveFocus()
    fireEvent.click(more)
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

// Immersive scenery (Scott, 2026-10-01): the shell wears the place's sky in
// the chosen light, the landscape stands in front of the page's rows, and
// Show scenery off removes all of it while the place's colours stay.
describe('Place scenery', () => {
  beforeEach(() => { selectionState.selection = null; localStorage.removeItem('symphony-show-scenery'); localStorage.removeItem('symphony-scenery-lighting') })
  afterEach(() => { mobileState.isMobile = false })

  for (const phone of [false, true]) {
    it(`stands in the scroller, outside the page, hidden from assistive tech (${phone ? 'phone' : 'desktop'})`, () => {
      mobileState.isMobile = phone
      renderAt('/today')
      const scenery = document.querySelector('[data-place-scenery]') as HTMLElement
      const page = screen.getByTestId('app-content')
      expect(scenery).toHaveAttribute('aria-hidden', 'true')
      expect(scenery.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
      expect(scenery).not.toContainElement(page)
      // Inside the scroller, so wheel and touch over it still scroll the page.
      const scroller = scenery.parentElement as HTMLElement
      expect(scroller).toContainElement(page)
      expect(scroller).toHaveClass('scenery-scroll')
      expect(document.querySelectorAll('[data-place-scenery]')).toHaveLength(1)
      // The page's own regions carry the sky's text colours.
      expect(page.closest('.scenery-page')).not.toBeNull()
    })
  }

  it('the shell wears the chosen lighting; the side pane is not a page region', () => {
    localStorage.setItem('symphony-scenery-lighting', 'nighttime')
    selectionState.selection = { kind: 'task', id: 't1' } as never
    renderAt('/today')
    const shell = document.querySelector('[data-scenery-lighting]') as HTMLElement
    expect(shell).toHaveAttribute('data-scenery-lighting', 'nighttime')
    expect(shell).toHaveClass('scenery-sky')
    const pane = document.querySelector('.side-column') as HTMLElement | null
    if (pane) expect(pane.closest('.scenery-page')).toBeNull()
  })

  it('Show scenery off removes the sky, landscape, fade and clearance', () => {
    localStorage.setItem('symphony-show-scenery', 'false')
    mobileState.isMobile = true
    renderAt('/today')
    expect(document.querySelector('[data-place-scenery]')).toBeNull()
    expect(document.querySelector('[data-scenery-lighting]')).toBeNull()
    expect(document.querySelector('.scenery-sky, .scenery-scroll, .scenery-end-clearance')).toBeNull()
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

  // Desktop keeps its round + (Scott, 2026-09-26); phones add from the dock's +.
  it('desktop has its round + button; phones add from the dock + with no floating button', () => {
    const desktop = renderAt('/today')
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-fab', 'true')
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    desktop.unmount()
    mobileState.isMobile = true
    renderAt('/today')
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-fab', 'false')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect([...nav.querySelectorAll('button')].map((b) => b.textContent || b.getAttribute('aria-label')))
      .toEqual(['Home', 'Today', 'Add', 'Plan', 'More'])
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-open', 'true')
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

  // Scott, 2026-09-29: no "+ Add ⌘K" in the top bar — the round + and ⌘K add.
  it.each(['/today', '/week', '/month', '/notes', '/inbox'])('%s has no Add button in the top bar; the round + stays', (path) => {
    renderAt(path)
    expect(screen.queryByRole('button', { name: 'Add — ⌘K' })).not.toBeInTheDocument()
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-fab', 'true')
  })

  it('⌘K still toggles the same capture', () => {
    renderAt('/week')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-open', 'true')
  })

  it('⌘⇧K is Talk to Symphony, not the add box', () => {
    renderAt('/week')
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true })
    expect(screen.getByTestId('quick-capture')).not.toHaveAttribute('data-open', 'true')
  })

  // Scott, 2026-10-14: no Shelves button on any page — Today's This week
  // column and Week's No day yet line hold what it opened.
  it.each(['/notes', '/inbox', '/today', '/week'])('%s has no Shelves button', (path) => {
    renderAt(path)
    expect(screen.queryByRole('button', { name: /shelves/i })).not.toBeInTheDocument()
    // Today is still one click away, on the rail.
    expect(screen.getAllByRole('link', { name: 'Today' })).toHaveLength(1)
  })
})

// Conversation is beside the page, with one compact entry point when closed.
describe('Conversation beside the plan', () => {
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; aiState.hidden = false; sessionStorage.clear() })
  afterEach(() => { aiState.hidden = true })
  it.each(['/season?view=constellation&horizon=1', '/today?view=alongside', '/week?view=alongside', '/routines'])('gives %s a full-height conversation instead of a footer', path => {
    renderAt(path)
    const conversation = screen.getByRole('region', { name: 'Chat with Symphony' })
    expect(conversation).toHaveClass('is-panel')
    expect(conversation).not.toHaveClass('is-docked')
    expect(conversation.closest('.side-column')).not.toBeNull()
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-right-inset', '420')
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Message Symphony')).toHaveLength(1)
  })
  it('keeps the page clear and provides a launcher when the panel is closed', () => {
    aiState.hidden = true
    renderAt('/week?view=alongside')
    expect(screen.queryByRole('region', { name: 'Chat with Symphony' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat with Symphony' })).toBeInTheDocument()
    expect(screen.getByTestId('quick-capture')).toHaveAttribute('data-right-inset', '0')
  })
})

// Symphony's history holds words, not tool calls: the shell tells each turn
// what became of the last change card (final review, 2026-10-14 #2).
describe('The change card reaches the next turn', () => {
  beforeEach(() => { aiState.hidden = false })
  afterEach(() => { aiState.hidden = true })
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null })
  const set = { key: 's1', title: '2 changes', ops: [
    { key: 's1:0', op: 'someday' as const, taskId: 'a', title: 'Paper mail' },
    { key: 's1:1', op: 'unplace' as const, taskId: 'b', title: 'Call the bank' },
  ] }

  it('a pending card is told to every turn; a dismissed one once', () => {
    renderAt('/week?view=alongside')
    const observer = assistantState.observer!
    act(() => observer.changeSet?.(set))
    expect(observer.changeCard?.()).toMatchObject({ state: 'pending', title: '2 changes' })
    fireEvent.click(within(screen.getByRole('region', { name: '2 changes' })).getByRole('button', { name: 'Discard draft' }))
    expect(observer.changeCard?.()).toMatchObject({ state: 'dismissed', ops: [{ op: 'someday', title: 'Paper mail', where: '→ Someday' }, { op: 'unplace', title: 'Call the bank', where: '→ No day yet' }] })
    expect(observer.changeCard?.()).toBeUndefined()
  })
})

// The card belongs where the person is talking (final review, 2026-10-14 #3):
// on a phone the conversation covers the page; on desktop pages without the
// docked bar the conversation is the side pane.
describe('The change card in the conversation', () => {
  afterEach(() => { mobileState.isMobile = false; aiState.hidden = true; selectionState.selection = null })
  const set = { key: 's2', title: '3 changes to your week', ops: [
    { key: 's2:0', op: 'someday' as const, taskId: 'a', title: 'Paper mail' },
    { key: 's2:1', op: 'unplace' as const, taskId: 'b', title: 'Call the bank' },
    { key: 's2:2', op: 'add' as const, title: 'Hold for WSWMD' },
  ] }

  it('shows in the phone conversation, over the page', () => {
    mobileState.isMobile = true
    renderAt('/week?view=alongside')
    fireEvent.click(screen.getByRole('button', { name: /^More/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    const chat = screen.getByRole('dialog', { name: 'Symphony conversation' })
    expect(within(chat).queryByRole('region', { name: '3 changes to your week' })).not.toBeInTheDocument()
    act(() => assistantState.observer!.changeSet?.(set))
    const card = within(chat).getByRole('region', { name: '3 changes to your week' })
    expect(within(card).getByRole('button', { name: 'Save 3 changes' })).toBeInTheDocument()
  })

  it('shows in the desktop side pane on a page with no docked bar', () => {
    aiState.hidden = false
    renderAt('/inbox')
    act(() => assistantState.observer!.changeSet?.(set))
    const card = screen.getByRole('region', { name: '3 changes to your week' })
    expect(card.closest('.side-column')).not.toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Discard draft' }))
    expect(screen.queryByRole('region', { name: '3 changes to your week' })).not.toBeInTheDocument()
  })
})

// Planning next week on this week's last day: an ADD with no day lands in the
// week Symphony read, not the one it is today (final review, 2026-10-14 #4).
describe('Approve puts an undated add in the planned week', () => {
  beforeEach(() => { aiState.hidden = false; mobileState.isMobile = false; selectionState.selection = null; localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: 6 })) })
  afterEach(() => { aiState.hidden = true; localStorage.removeItem('symphony-cadence-config') })

  it('uses the set\'s week_start', async () => {
    tasksState.addTask.mockClear()
    renderAt('/week?view=alongside')
    act(() => assistantState.observer!.changeSet?.({ key: 'w1', title: '1 change', weekStart: '2099-10-17', ops: [{ key: 'w1:0', op: 'add', title: 'Book the vet' }] }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save 1 change' })) })
    expect(tasksState.addTask).toHaveBeenCalledWith('Book the vet', undefined, undefined, undefined, { bucket: 'week', weekStart: new Date(2099, 9, 17) })
  })
})

describe('typing while voice is on (2026-10-14, Wednesday Wheelie\'s)', () => {
  it('keeps beta typing on the chat path even if an old voice session is active', () => {
    mobileState.isMobile = false
    aiState.hidden = false
    voiceState.access = true
    voiceState.active = true
    assistantState.sendMessage.mockClear()
    voiceState.sendText.mockClear()
    renderAt('/week')
    fireEvent.change(screen.getByLabelText('Message Symphony'), { target: { value: 'Add Wednesday Wheelies tonight 5:30–7' } })
    fireEvent.submit(screen.getByLabelText('Message Symphony').closest('form')!)
    expect(voiceState.sendText).not.toHaveBeenCalled()
    expect(assistantState.sendMessage).toHaveBeenCalledWith('Add Wednesday Wheelies tonight 5:30–7', undefined)
    expect(screen.queryByRole('button', { name: /Talk|End voice/ })).not.toBeInTheDocument()
    voiceState.active = false
    voiceState.access = false
    aiState.hidden = true
  })
})

// Guided planning (spec 2026-11-01): a page registers its session; the shell
// reopens the session's own thread and sends the step with every turn. It
// never opens the conversation by itself (planning as tooltips, 2026-11-04).
describe('A guided planning session in the shell', () => {
  const onThread = vi.fn()
  function GuidedPage({ stepId, on = true, onApplied }: { stepId: string; on?: boolean; onApplied?: () => void }) {
    useConversationWalk({ label: 'Help me plan the rest of my week', message: 'Help me plan the rest of my week.' })
    const reg = useMemo<GuidedSessionRegistration | null>(() => (on ? {
      level: 'week', periodLabel: 'Week of Nov 1', token: '2026-11-1', stepId,
      header: <p>Step header: {stepId}</p>,
      sessionContext: { horizon: 'weekly', periodLabel: 'Week of Nov 1', stepId, stepTitle: stepId,
        guide: { level: 'week', stepId, stepTitle: stepId, writes: ['inbox'], aboveLines: [], areas: [] } },
      threadKey: 'weekly:2026-11-1', onThread, threadId: 'known-thread', onApplied,
    } : null), [stepId, on, onApplied])
    useGuidedSessionRegistration(reg)
    return <div data-testid="app-content" />
  }
  const at = (node: ReactNode) => <MemoryRouter initialEntries={['/week']}><DomainProvider><DomainGateProvider><ShellLayout>{node}</ShellLayout></DomainGateProvider></DomainProvider></MemoryRouter>
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; aiState.hidden = true; assistantState.openThread.mockClear(); assistantState.resetSession.mockClear(); assistantState.newThread.mockClear(); onThread.mockClear() })
  afterEach(() => { mobileState.isMobile = false; aiState.hidden = true; assistantState.messages = [] })

  it('inside a session, New starts a fresh thread for that session and the history menu is gone', () => {
    assistantState.messages = [{ id: 'm1', role: 'user', content: 'Sunday talk', timestamp: new Date() }]
    aiState.hidden = false
    const view = render(at(<GuidedPage stepId="inbox" on={false} />))
    // Everyday: the history menu, and New goes back to an everyday conversation.
    expect(screen.getByRole('button', { name: 'Chat history' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(assistantState.resetSession).toHaveBeenCalledTimes(1)
    expect(assistantState.newThread).not.toHaveBeenCalled()

    view.rerender(at(<GuidedPage stepId="inbox" />))
    expect(screen.queryByRole('button', { name: 'Chat history' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(assistantState.newThread).toHaveBeenCalledTimes(1)
    expect(assistantState.resetSession).toHaveBeenCalledTimes(1)

    // Leaving is its own reset, back to the everyday thread.
    view.rerender(at(<GuidedPage stepId="inbox" on={false} />))
    expect(assistantState.resetSession).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Chat history' })).toBeInTheDocument()
  })

  it('desktop: the panel never opens by itself; opened by hand it has the step header and the session thread', () => {
    const view = render(at(<GuidedPage stepId="look-back" on={false} />))
    expect(screen.queryByRole('region', { name: 'Chat with Symphony' })).not.toBeInTheDocument()
    expect(assistantState.options?.sessionContext).toBeUndefined()

    view.rerender(at(<GuidedPage stepId="inbox" />))
    // The session starts: the page stays as it is, the conversation closed.
    expect(screen.queryByRole('region', { name: 'Chat with Symphony' })).not.toBeInTheDocument()
    expect(assistantState.openThread).toHaveBeenCalledTimes(1)
    expect(assistantState.openThread.mock.calls[0].slice(0, 2)).toEqual(['planning_session', 'weekly:2026-11-1'])
    expect(assistantState.options?.sessionContext).toMatchObject({ stepId: 'inbox', guide: { stepId: 'inbox' } })
    // A step change does not open it either.
    view.rerender(at(<GuidedPage stepId="calendar" />))
    expect(screen.queryByRole('region', { name: 'Chat with Symphony' })).not.toBeInTheDocument()
    expect(assistantState.options?.sessionContext).toMatchObject({ guide: { stepId: 'calendar' } })

    // The thread link reaches the page only when it is a different row.
    const reportThread = assistantState.openThread.mock.calls[0][2] as (id: string) => void
    reportThread('known-thread')
    expect(onThread).not.toHaveBeenCalled()
    reportThread('new-thread')
    expect(onThread).toHaveBeenCalledWith('new-thread')

    // Leaving returns to the everyday thread.
    view.rerender(at(<GuidedPage stepId="calendar" on={false} />))
    expect(assistantState.resetSession).toHaveBeenCalledTimes(1)
    expect(assistantState.options?.sessionContext).toBeUndefined()
  })

  it('desktop: open by hand, the conversation has the step’s header; leaving leaves the pane as it is', () => {
    aiState.hidden = false
    const view = render(at(<GuidedPage stepId="calendar" />))
    const panel = screen.getByRole('region', { name: 'Chat with Symphony' })
    expect(within(panel).getByText('Step header: calendar')).toBeInTheDocument()
    // The page's suggested talk gives way to the session.
    expect(within(panel).queryByText(/Suggested:/)).not.toBeInTheDocument()
    view.rerender(at(<GuidedPage stepId="calendar" on={false} />))
    expect(screen.getByRole('region', { name: 'Chat with Symphony' })).toBeInTheDocument()
    expect(screen.queryByText('Step header: calendar')).not.toBeInTheDocument()
    expect(assistantState.resetSession).toHaveBeenCalledTimes(1)
  })

  // The Week marks itself planned once a card is applied at its choosing step.
  it('a change card applied while the session runs is told to the page', async () => {
    const onApplied = vi.fn()
    aiState.hidden = false
    render(at(<GuidedPage stepId="choose" onApplied={onApplied} />))
    act(() => assistantState.observer!.changeSet?.({ key: 'g1', title: '1 change', ops: [{ key: 'g1:0', op: 'add', title: 'Book the vet' }] }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save 1 change' })) })
    expect(tasksState.addTask).toHaveBeenCalled()
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  // Phone: the session stays on the page; the conversation opens only when asked.
  it('phone: the overlay does not open on its own; opened by hand it has the header', () => {
    mobileState.isMobile = true
    function Talk() { const { openAssistant } = useAssistantLauncher(); return <button type="button" onClick={() => openAssistant()}>Talk</button> }
    const atPhone = (node: ReactNode) => <AssistantLaunchProvider>{at(<>{node}<Talk /></>)}</AssistantLaunchProvider>
    const view = render(atPhone(<GuidedPage stepId="inbox" on={false} />))
    const overlay = () => document.querySelector<HTMLElement>('[aria-label="Symphony conversation"]')!
    expect(overlay().style.display).toBe('none')
    view.rerender(atPhone(<GuidedPage stepId="inbox" />))
    expect(overlay().style.display).toBe('none')
    // The session's own thread still opens, ready for when they talk.
    expect(assistantState.openThread.mock.calls[0].slice(0, 2)).toEqual(['planning_session', 'weekly:2026-11-1'])
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }))
    expect(overlay().style.display).not.toBe('none')
    expect(within(overlay()).getByText('Step header: inbox')).toBeInTheDocument()
    view.rerender(atPhone(<GuidedPage stepId="inbox" on={false} />))
    expect(assistantState.resetSession).toHaveBeenCalledTimes(1)
  })
})

describe('change cards on a let-go item', () => {
  it('a card placing a let-go task applies (the lookup includes let-go rows) and writes the placement', async () => {
    const seen = '2026-10-14T07:00:00.123456+00:00'
    tasksState.letGoTasks = [{ id: 'lg1', title: 'Old idea', completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(Date.parse(seen)), bucket: 'someday', dismissedAt: new Date(2026, 9, 1) }]
    tasksState.updateTask.mockClear()
    let activity: ReturnType<typeof useCanvasActivity> | null = null
    function P() { activity = useCanvasActivity(); return null }
    render(<MemoryRouter initialEntries={['/week']}><DomainProvider><DomainGateProvider><ShellLayout><P /></ShellLayout></DomainGateProvider></DomainProvider></MemoryRouter>)
    act(() => activity!.setChangeSet({ key: 'lg', title: '1 change', ops: [{ key: 'lg:0', op: 'place', taskId: 'lg1', title: 'Old idea', date: '2026-11-06', seen }] }))
    let ok = false
    await act(async () => { ok = await activity!.approveChangeSet() })
    expect(ok).toBe(true)
    expect(tasksState.updateTask).toHaveBeenCalledWith('lg1', expect.anything())
    tasksState.letGoTasks = []
  })
})
