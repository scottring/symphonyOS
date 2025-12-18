import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ACTIVE_THEME } from './config/theme'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GoogleCalendarProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/calendar-callback" element={<CalendarCallback />} />
          <Route path="/join" element={<JoinHousehold />} />
        </Routes>
      </GoogleCalendarProvider>
    </BrowserRouter>
  </StrictMode>,
)
