import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import * as Sentry from '@sentry/react'

// Initialize Sentry for error tracking
if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance Monitoring — sample 20% of transactions (errors are still
    // captured at 100% regardless; this only trims performance-trace volume/cost
    // ahead of opening the app up beyond the household).
    tracesSampleRate: 0.2,
    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
    environment: import.meta.env.MODE,
    
    // Filter out certain errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      // Random plugins/extensions
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      // Network errors we can't control
      'NetworkError',
      'Failed to fetch',
      // ResizeObserver - safe to ignore
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],
    
    // Add custom data to all events
    beforeSend(event, _hint) {
      // Don't send errors in development (extra safety)
      if (import.meta.env.DEV) {
        return null
      }
      
      // Add custom context
      if (event.contexts) {
        event.contexts.app = {
          version: '1.0.0-beta',
          theme: localStorage.getItem('symphony-theme') || 'nordic',
        }
      }
      
      return event
    },
  })
}

// Handle Vite CSS preload errors gracefully — don't crash the entire app
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
})

// Load theme from localStorage, default to Nordic Journal
const THEME_STORAGE_KEY = 'symphony-theme'
const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
const ACTIVE_THEME = (savedTheme === 'kinetic' || savedTheme === 'nordic') ? savedTheme : 'nordic'

// Conditionally import CSS based on active theme
if (ACTIVE_THEME === 'kinetic') {
  await import('./kinetic-clarity.css')
} else {
  await import('./index.css')
}

// Apply the cached place theme before first paint so there's no color flash;
// PlaceProvider owns it (and syncs with the DB) once React mounts.
const savedPlace = localStorage.getItem('symphony-place')
if (savedPlace && savedPlace !== 'cabin' &&
    ['urban', 'small-city', 'mountain-town', 'farm'].includes(savedPlace)) {
  document.documentElement.dataset.place = savedPlace
}

import { Suspense, lazy } from 'react'
import { CalendarCallback } from './pages/CalendarCallback'
import { isDesktopShell } from './lib/desktop'
import { startRealtimeKeepAlive } from './lib/realtime/keepAlive'
import { JoinHousehold } from './components/JoinHousehold'
import { GoogleCalendarProvider } from './hooks/useGoogleCalendar'
import { DomainProvider } from './hooks/useDomain'
import { PlaceProvider } from './hooks/usePlace'
import { Shell } from './shell/Shell'
import { AuthGate } from './components/auth/AuthGate'
import { ErrorBoundary } from './components/ErrorBoundary'

// Quick-capture window for the Mac shell (desktop/): a frameless Tauri window
// loads /capture via the global hotkey. Lazy — browsers never fetch it.
const CapturePage = lazy(() => import('./desktop/CapturePage').then((m) => ({ default: m.CapturePage })))

// P5 cutover (gated). /, /today, /inbox, /task/:id route to the new Shell-mounted
// TasksApp when the flag is enabled, otherwise to legacy App.tsx. Both paths now
// share the same auth gate (AuthGate): App wraps itself in it, and
// the Shell mounts here are wrapped via `tasksElement`. This is what unblocks
// flipping the flag default-ON — previously the Shell rendered ungated and the
// auth-form e2e specs at `/` regressed (e2e/app.spec.ts). Flip locally for
// parallel-path testing:
//   localStorage.setItem('symphony.useNewTasks', '1'); location.reload()  // shell-mounted
//   localStorage.removeItem('symphony.useNewTasks'); location.reload()    // back to legacy (default)
//
// /tasks-new/* always routes to Shell regardless of the flag (planned to
// remove together with the legacy mounts once the cutover completes).
// Cutover complete (2026-06): the Shell owns the entire app. App.tsx is retired.
// The Shell MUST be mounted at a root-level splat
// (`/*`), never at exact paths like `/today`. The Shell renders descendant
// <Routes> (ShellRoutes -> TasksApp), and TasksApp matches segment-named child
// routes (`today`, `inbox`, `task/:id`). React Router only passes the remaining
// path to a descendant <Routes> when the parent route ends in `*`; mounting at
// exact `/today` consumes the segment and leaves nothing to match, so Today
// rendered blank. See src/shell/cutoverRouting.test.tsx for the repro + fix.
// Inside the Tauri Mac shell (desktop/), scope the native-feel CSS pass
// (cursors, selection, overscroll — see index.css tail) to the whole document.
if (isDesktopShell()) {
  document.documentElement.classList.add('desktop-shell')
}

// Bring the realtime socket back when it dies. Module scope, not a component:
// it watches the one shared socket for the whole app, so it should not be tied
// to any tree that can unmount. See lib/realtime/keepAlive.ts.
startRealtimeKeepAlive()

const cutoverShell = <AuthGate>{() => <Shell />}</AuthGate>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PlaceProvider>
      <DomainProvider>
        <BrowserRouter>
          <GoogleCalendarProvider>
            <Routes>
              {/* /, /today, /inbox, /task/:id are served by the Shell via the
                  /* catch-all below (explicit routes here win by specificity). */}
              <Route path="/goals/*" element={cutoverShell} />
              <Route path="/projects/*" element={cutoverShell} />
              <Route path="/routines/*" element={cutoverShell} />
              <Route path="/meds/*" element={cutoverShell} />
              <Route path="/contacts/*" element={cutoverShell} />
              <Route path="/family/*" element={cutoverShell} />
              <Route path="/agent/*" element={cutoverShell} />
              <Route path="/wall/*" element={<Shell />} /> {/* wall kiosk: own auth, stays ungated */}
              <Route path="/wall-v2/*" element={<Shell />} />
              <Route path="/jobs/*" element={cutoverShell} />
              <Route path="/tasks-new/*" element={cutoverShell} />
              <Route path="/morning/*" element={cutoverShell} />
              <Route path="/bedtime/*" element={cutoverShell} />
              <Route path="/meals/*" element={cutoverShell} />
              <Route path="/home/*" element={cutoverShell} />
              <Route path="/settings/*" element={cutoverShell} />
              <Route path="/history/*" element={cutoverShell} />
              <Route path="/lists/*" element={cutoverShell} />
              <Route path="/capture" element={<Suspense fallback={null}><CapturePage /></Suspense>} />
              <Route path="/join/:token" element={<JoinHousehold />} />
              <Route path="/calendar-callback" element={<CalendarCallback />} />
              {/* The Shell owns the cutover paths (/, /today, /inbox, /task/:id)
                  and any unmatched path. Explicit routes above win by specificity. */}
              <Route path="/*" element={cutoverShell} />
            </Routes>
          </GoogleCalendarProvider>
        </BrowserRouter>
      </DomainProvider>
      </PlaceProvider>
    </ErrorBoundary>
  </StrictMode>,
)
