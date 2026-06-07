// src/shell/ShellLayout.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, type ViewType } from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useMobile } from '@/hooks/useMobile';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';

/**
 * ShellLayout wraps Shell-mounted apps with the Symphony app chrome — the
 * sidebar (desktop) and a content frame.
 *
 * Why this exists: App.tsx (legacy mount) renders <AppShell> which wires up
 * the Sidebar with rich state (quick-capture, chat, pins, search, etc.).
 * Shell-mounted apps like /jobs and /tasks-new/* bypass App.tsx entirely
 * and previously rendered chromeless. ShellLayout gives them the navigation
 * chrome users expect on those routes without dragging in the full
 * AppShell prop surface (which is App.tsx-specific state).
 *
 * Apps that should render full-bleed (kiosk surfaces like /wall) opt out
 * by setting `chromeless: true` on their AppDef — Shell.tsx skips this
 * wrapper for those apps.
 */

const SIDEBAR_STORAGE_KEY = 'symphony-sidebar-collapsed';

/**
 * Derive ViewType from pathname so the Sidebar's active-item highlight
 * works for both legacy and Shell-mounted routes. Mirrors the precedence
 * App.tsx uses, minus state-based views (those are Shell-internal once
 * the cutover completes).
 */
function deriveActiveView(pathname: string): ViewType {
  if (pathname.startsWith('/goals')) return 'goals';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/routines')) return 'routines';
  if (pathname === '/contacts') return 'contacts';
  if (pathname.startsWith('/contacts/')) return 'contact-detail';
  if (pathname.startsWith('/meals')) return 'meals';
  if (pathname.startsWith('/agent')) return 'agent';
  if (pathname === '/morning') return 'morning';
  if (pathname === '/bedtime') return 'bedtime';
  if (pathname === '/inbox' || pathname.endsWith('/tasks-new/inbox')) return 'inbox';
  // /, /today, /tasks-new/today, /tasks-new and /task/:id all live under "today"
  return 'today';
}

interface Props {
  children: ReactNode;
}

export function ShellLayout({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile();
  const { user, signOut } = useAuth();

  // Persisted collapsed state — match App.tsx's storage key so toggle state
  // survives crossing the legacy/shell boundary.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  });
  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const activeView = useMemo(() => deriveActiveView(location.pathname), [location.pathname]);

  const { tasks } = useSupabaseTasks();
  const inboxCount = useMemo(
    () => tasks.filter((t) => t.bucket === 'inbox' && !t.completed).length,
    [tasks],
  );

  const handleViewChange = useCallback(
    (view: ViewType) => {
      // Mirror App.tsx's handleViewChange URL routing, minus state-based
      // views (those rely on App.tsx-internal stateView and don't apply
      // to Shell-mounted routes).
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
        default:
          // Views like 'lists', 'notes', 'history', 'settings',
          // 'task-detail' are state-based in App.tsx — under Shell we
          // can't drive them yet, so route home.
          navigate('/');
      }
    },
    [navigate],
  );

  return (
    <div className="h-screen flex overflow-hidden overflow-x-hidden bg-bg-base w-full max-w-[100vw]">
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          userEmail={user?.email ?? undefined}
          onSignOut={signOut}
          activeView={activeView}
          onViewChange={handleViewChange}
          inboxCount={inboxCount}
        />
      )}
      {/* Content frame — uses <div> (not <main>) because individual apps
          like JobPipelineApp render their own <main>. Avoids invalid
          nested-main HTML and keeps existing e2e selectors valid. */}
      <div className="relative flex-1 overflow-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
