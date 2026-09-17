import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { DomainProvider } from '@/hooks/useDomain'
import { DomainGateProvider } from '@/components/domain/DomainGate'
import { deriveActiveView, ShellLayout } from './ShellLayout'

// Regression test for the House sidebar link: it navigated to '/home' but
// deriveActiveView had no case for that prefix, so it fell through to the
// 'today' default — House never highlighted and its inline room list never
// auto-expanded (Sidebar.tsx's `libraryActive`/`homeAppActive` both read
// off `activeView`).
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
vi.mock('./providers/SelectionProvider', () => ({ useSelection: () => ({ selection: selectionState.selection }) }))

vi.mock('@/contexts/NotesContext', () => ({ NotesProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/contexts/ListsContext', () => ({ ListsProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/contexts/PinsContext', () => ({ PinsProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))

vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
vi.mock('@/components/layout/MoreSheet', () => ({ MoreSheet: () => null }))
vi.mock('@/components/layout/QuickCapture', () => ({ QuickCapture: () => null }))
vi.mock('@/components/layout/NewVersionBanner', () => ({ NewVersionBanner: () => null }))
vi.mock('@/components/omnibox/OmniboxResults', () => ({ OmniboxResults: () => null }))
vi.mock('@/components/chat/ChatPanel', () => ({ ChatPanel: () => null }))
vi.mock('@/components/toast', () => ({ Toast: () => null, ConfirmationToast: () => null }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DomainProvider>
        <DomainGateProvider>
          <ShellLayout><div data-testid="app-content" /></ShellLayout>
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
  beforeEach(() => { mobileState.isMobile = false; selectionState.selection = null; sessionStorage.clear() })

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
    expect(screen.getByRole('button', { name: 'Unpin week list' })).toBeInTheDocument()
    withDetail.unmount()

    selectionState.selection = null
    renderAt('/today')
    expect(screen.getByRole('complementary', { name: 'Pinned reference lists' })).toBeInTheDocument()
    sessionStorage.clear()
  })
})

describe('Phone execution chrome', () => {
  it('keeps references off the phone even when desktop lists were pinned', () => {
    mobileState.isMobile = true
    sessionStorage.setItem('symphony-reference-lists:anonymous', JSON.stringify([{ kind: 'week', date: new Date().toISOString() }]))
    renderAt('/today')
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin month list' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
    sessionStorage.clear()
  })
})
