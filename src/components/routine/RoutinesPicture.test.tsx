import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import { createMockActionableInstance, createMockRoutine } from '@/test/mocks/factories'
import { RoutinesPicture } from './RoutinesPicture'

const h = vi.hoisted(() => ({
  instances: [] as ActionableInstance[],
  changeSet: null as ChangeSet | null,
  phone: false,
  setSelection: vi.fn(),
  reschedule: vi.fn(async () => ({ id: 'prev' })),
  undoReschedule: vi.fn(async () => true),
  run: vi.fn(async (_label: string, command: () => Promise<unknown>, _opts?: { undo?: () => Promise<unknown> }) => { await command(); return true }),
}))
vi.mock('@/components/home/week/useWeekInstances', () => ({ useWeekInstances: () => h.instances }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ reschedule: h.reschedule, undoReschedule: h.undoReschedule }) }))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => ({ run: h.run, changeSet: h.changeSet }) }))
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelectionOptional: () => ({ setSelection: h.setSelection }) }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => h.phone }))
vi.mock('@/lib/cadence/config', async (orig) => {
  const real = await orig<typeof import('@/lib/cadence/config')>()
  return { ...real, useCadenceConfig: () => ({ config: { ...real.DEFAULT_CADENCE, weekStartsOn: 6 }, setConfig: () => {} }) }
})

const r = (id: string, name: string, over: Partial<Routine> = {}) => createMockRoutine({ id, name, time_of_day: null, recurrence_pattern: { type: 'daily' }, context: 'family', ...over })
const SCHOOL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const IRIS = { id: 'iris', user_id: 'u1', name: 'Iris', initials: 'I', color: '#6b5a96', avatar_url: null, is_full_user: true, age_range: 'adult', display_order: 1, created_at: '' } as never
const ROUTINES = [
  r('bed', 'Kids bedtime routine', { time_of_day: '19:30' }),
  r('s1', 'Brush teeth', { parent_routine_id: 'bed' }),
  r('school', 'School morning', { time_of_day: '06:45', recurrence_pattern: { type: 'weekly', days: SCHOOL_DAYS } }),
  r('ffg', 'FFG pickup', { time_of_day: '17:15', recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu'] } }),
  r('cut', 'Kaleb haircut', { recurrence_pattern: { type: 'weekly', days: ['thu'] } }),
  r('fin', 'Financial review', { recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
  r('lib', 'Library with the kids', { recurrence_pattern: { type: 'weekly', days: [] } }),
  r('camp', 'Camp mornings', { visibility: 'reference' }),
]
const page = (props: Partial<Parameters<typeof RoutinesPicture>[0]> = {}) => render(
  <MemoryRouter><RoutinesPicture routines={ROUTINES} familyMembers={[IRIS]} {...props} /></MemoryRouter>,
)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9)) // Wed Oct 14
  h.instances = []; h.changeSet = null; h.phone = false
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('RoutinesPicture', () => {
  it('heads the week in the household order with a sentence from the rules', () => {
    page()
    expect(screen.getByText('Our rhythm · week of Oct 10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Routines' })).toBeInTheDocument()
    expect(screen.getByText(/^School days run 6:45 to bedtime at 7:30\./)).toBeInTheDocument()
    const heads = screen.getAllByText(/^(Sat|Sun|Mon|Tue|Wed|Thu|Fri)$/).map((e) => e.textContent)
    expect(heads).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  })

  it('places routines by band and day; every-day, monthly, no-day and resting ones on their lines', () => {
    page()
    expect(within(screen.getByRole('region', { name: 'Every day' })).getByText('Kids bedtime routine')).toBeInTheDocument()
    expect(within(screen.getByTestId('cell-morning-2026-10-12')).getByText('School morning')).toBeInTheDocument()
    expect(within(screen.getByTestId('cell-evening-2026-10-15')).getByText('FFG pickup')).toBeInTheDocument()
    expect(within(screen.getByTestId('cell-anytime-2026-10-15')).getByText('Kaleb haircut')).toBeInTheDocument()
    expect(screen.queryByTestId('cell-morning-2026-10-10')?.textContent).toBe('')
    expect(within(screen.getByRole('region', { name: 'Each month' })).getByText('Financial review')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'No day yet' })).getByText('Library with the kids')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Not showing' })).getByText('Camp mornings')).toBeInTheDocument()
    expect(screen.getByTestId('cell-morning-2026-10-14')).toHaveClass('is-today')
    expect(screen.queryByText('Brush teeth')).toBeNull()
  })

  it("shows this week's saved changes in place, with a this-week mark", () => {
    h.instances = [
      createMockActionableInstance({ entity_type: 'routine', entity_id: 'bed', date: '2026-10-16', status: 'skipped' }),
      createMockActionableInstance({ entity_type: 'routine', entity_id: 'ffg', date: '2026-10-15', assigned_to_override: 'iris' }),
    ]
    page()
    const fri = screen.getByTestId('cell-evening-2026-10-16')
    expect(within(fri).getByText('Kids bedtime routine').closest('s')).not.toBeNull()
    expect(within(fri).getByText('This week · skipped')).toBeInTheDocument()
    const thu = screen.getByTestId('cell-evening-2026-10-15')
    expect(within(thu).getByText('This week · Iris')).toBeInTheDocument()
    expect(within(thu).getByLabelText('Iris')).toBeInTheDocument()
  })

  it('opens a tapped routine in the panel, for the day it was tapped on', () => {
    page()
    fireEvent.click(within(screen.getByTestId('cell-evening-2026-10-15')).getByRole('button', { name: /FFG pickup/ }))
    expect(h.setSelection).toHaveBeenCalledWith({ kind: 'routine', id: 'ffg', date: '2026-10-15' })
    fireEvent.click(screen.getByRole('button', { name: /Financial review/ }))
    expect(h.setSelection).toHaveBeenLastCalledWith({ kind: 'routine', id: 'fin' })
  })

  it('dragging one occurrence to another day moves that occurrence only, with Undo', async () => {
    page()
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', get types() { return [...data.keys()] }, effectAllowed: 'move', dropEffect: 'move' }
    fireEvent.dragStart(within(screen.getByTestId('cell-evening-2026-10-15')).getByRole('button', { name: /FFG pickup/ }), { dataTransfer })
    fireEvent.drop(screen.getByTestId('cell-anytime-2026-10-16'), { dataTransfer })
    await vi.waitFor(() => expect(h.reschedule).toHaveBeenCalled())
    expect(h.reschedule).toHaveBeenCalledWith('routine', 'ffg', new Date(2026, 9, 15), new Date(2026, 9, 16, 17, 15), undefined)
    const opts = h.run.mock.calls[0][2]
    await opts?.undo?.()
    expect(h.undoReschedule).toHaveBeenCalledWith({ id: 'prev' })
  })

  it('draws a pending change card dashed: a skip struck, a new day teal', () => {
    h.changeSet = { key: 'c', title: '2 changes', ops: [
      { key: 'c:0', op: 'routine_skip', routineId: 'bed', title: 'Kids bedtime routine', date: '2026-10-16' },
      { key: 'c:1', op: 'routine_change', routineId: 'cut', title: 'Kaleb haircut', days: ['fri'] },
    ] }
    page()
    const fri = screen.getByTestId('cell-evening-2026-10-16')
    expect(within(fri).getByTestId('proposed-row')).toHaveTextContent('Skipped · this week')
    expect(within(screen.getByTestId('cell-anytime-2026-10-15')).getByTestId('leaving-row')).toHaveTextContent('Kaleb haircut')
    expect(within(screen.getByTestId('cell-anytime-2026-10-16')).getByTestId('proposed-row')).toHaveTextContent('Kaleb haircut')
  })

  it('pages to the next week and back', () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Week of Oct 17' }))
    expect(screen.getByText('Our rhythm · week of Oct 17')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to this week' }))
    expect(screen.getByText('Our rhythm · week of Oct 10')).toBeInTheDocument()
  })

  it('has none of the old board: no Arrange switch, Needs a look, Build with Symphony or search', () => {
    page()
    expect(screen.queryByRole('group', { name: 'Arrange routines' })).toBeNull()
    expect(screen.queryByText(/Needs a look/i)).toBeNull()
    expect(screen.queryByText(/Build with Symphony/i)).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'New routine' })).toHaveAttribute('href', '/routines/new')
  })

  it('offers the walk on the page where there is no bar', () => {
    const onStart = vi.fn()
    page({ walk: { label: 'Change our routines', onStart } })
    fireEvent.click(screen.getByRole('button', { name: 'Change our routines' }))
    expect(onStart).toHaveBeenCalled()
  })

  it('phone: a day picker and that day’s whole list, every-day routines included', () => {
    h.phone = true
    page()
    const list = screen.getByRole('list', { name: 'Wednesday, October 14' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('School morning'), expect.stringContaining('FFG pickup'), expect.stringContaining('Kids bedtime routine'),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Saturday, October 10' }))
    expect(screen.getByRole('list', { name: 'Saturday, October 10' })).toHaveTextContent('Kids bedtime routine')
  })

  it('keeps the honest empty states', () => {
    const { unmount } = page({ routines: [], loading: true })
    expect(screen.getByText('Loading your routines…')).toBeInTheDocument()
    unmount()
    const onShowAllDomains = vi.fn()
    const second = page({ routines: [], hiddenByFilter: true, onShowAllDomains })
    fireEvent.click(screen.getByRole('button', { name: 'Show all domains' }))
    expect(onShowAllDomains).toHaveBeenCalled()
    second.unmount()
    page({ routines: [] })
    expect(screen.getByRole('heading', { name: 'No routines yet' })).toBeInTheDocument()
  })
})
