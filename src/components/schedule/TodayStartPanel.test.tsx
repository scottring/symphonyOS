import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import { FIRST_SUCCESS_KEY, whereFirstThingIs } from '@/lib/firstSuccess'
import { TodayStartPanel } from './TodayStartPanel'

// Walkthrough 2026-10-08, fresh household: "Where would you like to start?"
// vanished the moment the first task was added — no acknowledgment, and the
// "Plan with guidance" door went with it.

const UID = 'user-new'

function panel(over: Partial<Parameters<typeof TodayStartPanel>[0]> = {}) {
  return (
    <TodayStartPanel
      uid={UID}
      tasks={[]}
      tasksReady
      startOpen={false}
      startHidden={false}
      steps={[]}
      onHide={vi.fn()}
      onSamplePage={vi.fn()}
      {...over}
    />
  )
}

const todayTask = (): Task => createMockTask({ title: 'Call the plumber', bucket: 'timed', plannedOn: new Date(), createdAt: new Date() })

/** Empty planner with the start panel up, then the first task lands — the
 *  sequence HomeViewContainer drives (showFirstWeek goes false at taskCount 1). */
async function newHouseholdAddsFirstTask() {
  const view = render(panel({ startOpen: true }))
  expect(screen.getByRole('heading', { name: 'Where would you like to start?' })).toBeInTheDocument()
  view.rerender(panel({ startOpen: false, tasks: [todayTask()] }))
  return view
}

describe('Today start panel, after the first thing', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/today')
  })

  it('shows the start panel to a new household with zero tasks', () => {
    render(panel({ startOpen: true }))
    expect(screen.getByRole('heading', { name: 'Where would you like to start?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan with guidance →' })).toHaveAttribute('href', '/start')
  })

  it('replaces the start panel with an acknowledgment and next steps after the first task, not nothing', async () => {
    await newHouseholdAddsFirstTask()
    expect(screen.queryByRole('heading', { name: 'Where would you like to start?' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your first thing is on Today.')
    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan this week' })).toHaveAttribute('href', '/week')
    expect(screen.getByRole('link', { name: 'Plan with guidance' })).toHaveAttribute('href', '/start')
    expect(screen.getByRole('button', { name: 'I’m set' })).toBeInTheDocument()
  })

  it('does not take focus when it appears', async () => {
    const before = document.activeElement
    await newHouseholdAddsFirstTask()
    expect(document.activeElement).toBe(before)
  })

  it('"Add another" opens the add box for today and leaves the line up', async () => {
    const open = vi.fn()
    window.addEventListener('symphony:add-today', open)
    const { user } = await newHouseholdAddsFirstTask()
    await user.click(screen.getByRole('button', { name: 'Add another' }))
    expect(open).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toBeInTheDocument()
    window.removeEventListener('symphony:add-today', open)
  })

  it('"Plan this week" goes to the Week page and retires the line', async () => {
    const view = await newHouseholdAddsFirstTask()
    const { user } = view
    await user.click(screen.getByRole('link', { name: 'Plan this week' }))
    expect(window.location.pathname).toBe('/week')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    view.unmount()
    render(panel({ tasks: [todayTask()] }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('"Plan with guidance" goes to /start and retires the line', async () => {
    const { user } = await newHouseholdAddsFirstTask()
    await user.click(screen.getByRole('link', { name: 'Plan with guidance' }))
    expect(window.location.pathname).toBe('/start')
    expect(localStorage.getItem(FIRST_SUCCESS_KEY(UID))).toBe('done')
  })

  it('"I’m set" dismisses it, and it stays dismissed across a remount', async () => {
    const view = await newHouseholdAddsFirstTask()
    const { user } = view
    await user.click(screen.getByRole('button', { name: 'I’m set' }))
    expect(screen.queryByRole('region', { name: 'Next step' })).not.toBeInTheDocument()
    view.unmount()
    const again = render(panel({ tasks: [todayTask()] }))
    expect(again.container).toBeEmptyDOMElement()
  })

  it('comes back after a reload until dismissed (the offer is remembered per user)', async () => {
    const view = await newHouseholdAddsFirstTask()
    view.unmount()
    render(panel({ tasks: [todayTask()] }))
    expect(screen.getByRole('status')).toHaveTextContent('Your first thing is on Today.')
  })

  it('never shows for an established account that was never offered the start panel', () => {
    const { container } = render(panel({ tasks: [todayTask(), todayTask()] }))
    expect(container).toBeEmptyDOMElement()
    expect(localStorage.getItem(FIRST_SUCCESS_KEY(UID))).toBeNull()
  })

  it('does not count a still-loading task list as an empty planner', () => {
    const view = render(panel({ startOpen: true, tasksReady: false }))
    expect(localStorage.getItem(FIRST_SUCCESS_KEY(UID))).toBeNull()
    view.rerender(panel({ tasks: [todayTask()] }))
    expect(view.container).toBeEmptyDOMElement()
  })

  it('"Explore on my own" still hides everything, including the follow-up', async () => {
    const onHide = vi.fn()
    const view = render(panel({ startOpen: true, onHide }))
    await view.user.click(screen.getByRole('button', { name: 'Explore on my own' }))
    expect(onHide).toHaveBeenCalledOnce()
    // HomeViewContainer records the hide and closes the panel.
    view.rerender(panel({ startOpen: false, startHidden: true }))
    expect(view.container).toBeEmptyDOMElement()
    view.rerender(panel({ startOpen: false, startHidden: true, tasks: [todayTask()] }))
    expect(view.container).toBeEmptyDOMElement()
  })

  it('lapses two weeks after the offer if never answered', () => {
    localStorage.setItem(FIRST_SUCCESS_KEY(UID), new Date(Date.now() - 15 * 86400000).toISOString())
    const { container } = render(panel({ tasks: [todayTask()] }))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('whereFirstThingIs', () => {
  const today = new Date(2026, 9, 8, 9)
  it('names the place the earliest task was saved', () => {
    expect(whereFirstThingIs([createMockTask({ bucket: 'inbox', createdAt: today })], today)).toBe('in Inbox')
    expect(whereFirstThingIs([createMockTask({ bucket: 'week', createdAt: today })], today)).toBe('in this week’s plan')
    expect(whereFirstThingIs([createMockTask({ bucket: 'timed', scheduledFor: new Date(2026, 9, 8, 15), createdAt: today })], today)).toBe('on Today')
    expect(whereFirstThingIs([createMockTask({ bucket: 'timed', scheduledFor: new Date(2026, 9, 9, 15), createdAt: today })], today)).toBe('on Friday, October 9')
    const earlier = createMockTask({ bucket: 'inbox', createdAt: new Date(2026, 9, 8, 8) })
    const later = createMockTask({ bucket: 'week', createdAt: new Date(2026, 9, 8, 8, 30) })
    expect(whereFirstThingIs([later, earlier], today)).toBe('in Inbox')
  })
})
