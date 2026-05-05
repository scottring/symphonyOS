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
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions for beta (reduce later)
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

import App from './App.tsx'
import { Suspense } from 'react'
import { CalendarCallback } from './pages/CalendarCallback'
import { NotFound } from './components/NotFound'
import { JoinHousehold } from './components/JoinHousehold'
import { GoogleCalendarProvider } from './hooks/useGoogleCalendar'
import { DomainProvider } from './hooks/useDomain'
import { Shell } from './shell/Shell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OnboardingFlow, SamplePlanPage } from './components/lazy'
import { LoadingFallback } from './components/layout/LoadingFallback'

// P4.8 cutover feature flag. When enabled, /, /today, /inbox, /task/:id
// route to the new Shell-mounted TasksApp. Default OFF — legacy App.tsx
// remains active. Flip via dev tools:
//   localStorage.setItem('symphony.useNewTasks', '1'); location.reload()
// Revert with:
//   localStorage.removeItem('symphony.useNewTasks'); location.reload()
//
// /tasks-new/* always routes to Shell regardless of flag (kept for parallel
// access during P4 and rollback safety; planned to remove in P5 cleanup).
const useNewTasks =
  typeof window !== 'undefined' &&
  window.localStorage.getItem('symphony.useNewTasks') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DomainProvider>
        <BrowserRouter>
          <GoogleCalendarProvider>
            <Routes>
              <Route path="/" element={useNewTasks ? <Shell /> : <App />} />
              <Route path="/today" element={useNewTasks ? <Shell /> : <App />} />
              <Route path="/inbox" element={useNewTasks ? <Shell /> : <App />} />
              <Route path="/task/:taskId" element={useNewTasks ? <Shell /> : <App />} />
              <Route path="/goals" element={<App />} />
              <Route path="/goals/:goalId" element={<App />} />
              <Route path="/projects" element={<App />} />
              <Route path="/projects/:projectId" element={<App />} />
              <Route path="/routines" element={<App />} />
              <Route path="/routines/new" element={<App />} />
              <Route path="/routines/:routineId" element={<App />} />
              <Route path="/contacts" element={<App />} />
              <Route path="/contacts/:contactId" element={<App />} />
              <Route path="/wall/*" element={<Shell />} />
              <Route path="/jobs/*" element={<Shell />} />
              <Route path="/tasks-new/*" element={<Shell />} />
              <Route path="/morning" element={<App />} />
              <Route path="/bedtime" element={<App />} />
              <Route path="/onboarding" element={<Suspense fallback={<LoadingFallback />}><OnboardingFlow /></Suspense>} />
              <Route path="/onboarding/sample" element={<Suspense fallback={<LoadingFallback />}><SamplePlanPage /></Suspense>} />
              <Route path="/meals/shelf" element={<App />} />
              <Route path="/meals/plan" element={<App />} />
              <Route path="/meals/brief" element={<App />} />
              <Route path="/meals/today" element={<App />} />
              <Route path="/meals/habits" element={<App />} />
              <Route path="/meals/grams" element={<App />} />
              <Route path="/meals/tonight" element={<App />} />
              <Route path="/meals/day/:date" element={<App />} />
              <Route path="/meals/cook/:recipeId" element={<App />} />
              <Route path="/join/:token" element={<JoinHousehold />} />
              <Route path="/calendar-callback" element={<CalendarCallback />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </GoogleCalendarProvider>
        </BrowserRouter>
      </DomainProvider>
    </ErrorBoundary>
  </StrictMode>,
)
