/* eslint-disable react-refresh/only-export-components -- dev-only fixture fakes */
// The real stylesheets, in the app's order (main.tsx).
import '@/index.css'
import '@/styles/layout-system.css'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { parseLocalYmd } from '@/lib/cadence/config'
import { DndContext } from '@dnd-kit/core'
import { WeekV2 } from '@/components/plan/v2/WeekV2'
import { WeekJournal } from '@/components/home/week/WeekJournal'
import { buildJournalDays } from '@/lib/week/journalDays'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { WEEK } from './mocks/fixtures'
import { FIXTURE_WEEK_STARTS, fixtureWeekStartKey } from './mocks/cadenceConfig'
import { PlanPageV2 } from '@/components/plan/v2/PlanPageV2'
import { DomainProvider } from '@/hooks/useDomain'

try { localStorage.setItem('symphony-week-ref', new URLSearchParams(location.search).get('ref') === '0' ? 'shut' : 'open') } catch { /* */ }
function Page() {
  const { tasks } = useSupabaseTasks()
  // The week the URL names (an onward step from the Month), else this week.
  const start = new URLSearchParams(useLocation().search).get('start')
  const weekStart = start ? parseLocalYmd(start) : WEEK
  const dated = tasks.filter((t) => t.scheduledFor)
  const weekendTasks = tasks.filter((t) => t.weekendStart && !t.scheduledFor)
  const { days, weekend } = buildJournalDays({ weekStart, dayCount: 7, tasks: dated, weekendTasks, userId: 'me', eventItems: [], events: [], dinnersByDay: new Map(), routineItems: [], instances: [], labelFor: () => undefined })
  return (
    <div className={PAGE_PLANNING} style={{ paddingTop: 24 }}>
      <p role="note" style={{ margin: '0 0 12px', fontSize: 12, color: '#8a6d3b' }}>Fixture harness — made-up tasks, nothing is saved.</p>
      <WeekStartPreview />
      <DndContext>
        <WeekV2 key={weekStart.getTime()} tasks={tasks} weekStart={weekStart} meId="me" isCurrent={weekStart.getTime() === WEEK.getTime()} onSelectTask={() => {}}
          renderDays={(o) => <WeekJournal layout="grid" days={days} weekend={weekend} spans={[]} onSelectItem={() => {}} onToggleEntry={() => {}} {...o} />} />
      </DndContext>
    </div>
  )
}
/** Preview the page with each week start the app offers. A URL change only:
 *  no setting is written, here or in any account. */
function WeekStartPreview() {
  const current = fixtureWeekStartKey()
  const hrefFor = (key: string) => { const q = new URLSearchParams(location.search); q.set('weekStart', key); return `?${q.toString()}` }
  return (
    <nav aria-label="Preview week start (fixture only, not saved)" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center', margin: '0 0 16px', fontSize: 13, maxWidth: '100%' }}>
      <span>Preview the week starting on</span>
      {FIXTURE_WEEK_STARTS.map((w) => (
        <a key={w.key} href={hrefFor(w.key)} aria-current={w.key === current ? 'page' : undefined}
          style={{ padding: '3px 10px', borderRadius: 999, border: '1px solid #c9d3cc', textDecoration: 'none', color: w.key === current ? '#fff' : '#24493a', background: w.key === current ? '#24493a' : 'transparent' }}>{w.label}</a>
      ))}
      <span style={{ color: '#6b7280' }}>· preview only, not your setting</span>
    </nav>
  )
}

const params = new URLSearchParams(location.search)
// ?layout=journal opens Open journal as an onward step does — router state,
// nothing stored. The page's own View switch works as in the app.
const arrive = params.get('layout') === 'journal' ? { journal: true } : null
const page = params.get('page')
const first = page === 'season' || page === 'month' ? `/${page}` : '/week'

/** Pages outside the harness: say so, rather than look like a dead button. */
function NotInHarness() {
  const l = useLocation(); const go = useNavigate()
  return (
    <div className={PAGE_PLANNING} style={{ paddingTop: 24 }}>
      <p role="note" style={{ fontSize: 14 }}>The app would open <code>{l.pathname}{l.search}</code> here. That page isn’t part of this fixture harness.</p>
      <button type="button" onClick={() => go(-1)} style={{ marginTop: 8, textDecoration: 'underline' }}>Back</button>
    </div>
  )
}
const planPage = (level: 'season' | 'month') => <DomainProvider><div className={PAGE_PLANNING} style={{ paddingTop: 24 }}><PlanPageV2 key={level} level={level} /></div></DomainProvider>

// Routes, so an onward step walks on: Season → Month → Week, the journal
// carried in router state as in the app.
createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[{ pathname: first, state: arrive }]}>
    <Routes>
      <Route path="/week" element={<Page />} />
      <Route path="/month" element={planPage('month')} />
      <Route path="/season" element={planPage('season')} />
      <Route path="*" element={<NotInHarness />} />
    </Routes>
  </MemoryRouter>,
)
