// src/apps/tasks/TasksApp.tsx
import { useMemo, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ListsProvider } from '@/contexts/ListsContext';
import { NotesProvider } from '@/contexts/NotesContext';
import { GoalsProvider } from '@/contexts/GoalsContext';
import { AppShellChromeContext, type AppShellChromeContextValue } from '@/contexts/AppShellChromeContext';
import { HomeViewContainer } from './HomeViewContainer';
import { InboxViewContainer } from './InboxViewContainer';
import { TaskViewRoute } from './TaskViewRoute';
import { WeekView, MonthView, SeasonView, YearView, SomedayView } from './HorizonView';

// TasksApp is the index app at `/` (after the P4.8 cutover). Its inner
// Routes handle both:
// - the cutover paths: `/`, `/today`, `/inbox`, `/task/:taskId`
// - the legacy parallel paths under `/tasks-new/*` (kept for rollback
//   safety until P5 cleanup): `tasks-new`, `tasks-new/today`,
//   `tasks-new/inbox`, `tasks-new/task/:taskId`
//
// Both branches use the same containers (HomeViewContainer, InboxViewContainer,
// TaskViewRoute), so behavior is identical. The cutover is gated by a
// localStorage feature flag in main.tsx; with the flag OFF the App.tsx
// legacy mount handles /today, /inbox, /task/:id and Shell isn't reached
// for those paths.

export function TasksApp() {
  // HomeHeader (rendered by HomeView) consumes AppShellChrome, which the legacy
  // AppShell provides. The Shell path has no AppShell, so supply a no-op chrome
  // context here to keep AppShell's fail-fast guardrail intact while letting the
  // Today masthead render. Chat/help buttons are inert in the Shell for now —
  // wiring them to the Shell's own chrome is a follow-up.
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const chrome = useMemo<AppShellChromeContextValue>(
    () => ({
      chatOpen: false,
      onChatOpenChange: () => {},
      helpOpen: false,
      onHelpOpenChange: () => {},
      helpButtonRef,
    }),
    [],
  );

  return (
    <AppShellChromeContext.Provider value={chrome}>
      <GoalsProvider>
        <ListsProvider>
          <NotesProvider>
            <Routes>
            {/* Cutover paths (active when feature flag enabled) */}
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="today" element={<HomeViewContainer />} />
            <Route path="inbox" element={<InboxViewContainer />} />
            <Route path="task/:taskId" element={<TaskViewRoute />} />
            {/* Phase 2b — horizon rungs. Each renders ONLY its scoped pool +
                carry-over (the anti-overwhelm invariant). Today keeps its rich
                HomeView above. */}
            <Route path="week" element={<WeekView />} />
            <Route path="month" element={<MonthView />} />
            <Route path="season" element={<SeasonView />} />
            <Route path="year" element={<YearView />} />
            <Route path="someday" element={<SomedayView />} />
            {/* Legacy parallel paths (always available; planned to remove in P5) */}
            <Route path="tasks-new" element={<Navigate to="/tasks-new/today" replace />} />
            <Route path="tasks-new/today" element={<HomeViewContainer />} />
            <Route path="tasks-new/inbox" element={<InboxViewContainer />} />
            <Route path="tasks-new/task/:taskId" element={<TaskViewRoute />} />
            </Routes>
          </NotesProvider>
        </ListsProvider>
      </GoalsProvider>
    </AppShellChromeContext.Provider>
  );
}
