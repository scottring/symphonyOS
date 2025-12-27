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
import { CalendarCallback } from './pages/CalendarCallback'
import { JoinHousehold } from './pages/JoinHousehold'
import { GoogleCalendarProvider } from './hooks/useGoogleCalendar'
import { DomainProvider } from './hooks/useDomain'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DomainProvider>
        <BrowserRouter>
          <GoogleCalendarProvider>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/projects" element={<App />} />
              <Route path="/projects/:projectId" element={<App />} />
              <Route path="/routines" element={<App />} />
              <Route path="/routines/new" element={<App />} />
              <Route path="/routines/:routineId" element={<App />} />
              <Route path="/contacts" element={<App />} />
              <Route path="/contacts/:contactId" element={<App />} />
              <Route path="/calendar-callback" element={<CalendarCallback />} />
              <Route path="/join" element={<JoinHousehold />} />
            </Routes>
          </GoogleCalendarProvider>
        </BrowserRouter>
      </DomainProvider>
    </ErrorBoundary>
  </StrictMode>,
)
