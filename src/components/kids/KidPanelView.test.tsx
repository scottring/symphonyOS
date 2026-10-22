import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/kids/timerSounds', async (orig) => ({ ...(await orig<typeof import('@/lib/kids/timerSounds')>()), playTimerSound: vi.fn(), unlockAudio: vi.fn() }))

import { KidPanelView } from './KidPanelView'
import { buildKidPanel } from '@/lib/kids/kidPanelModel'
import { playTimerSound } from '@/lib/kids/timerSounds'
import { withTicks } from './KidKioskRoute'
import type { KidRow, MemberDayModel } from '@/lib/wall/kidDayModel'

const r = (id: string, title: string, time: string | null, done = false): KidRow => ({ entityType: 'routine', id, title, done, timeOfDay: time, target: null })
const model: MemberDayModel = {
  needed: [], reading: null, school: null, homework: [], papers: [], notices: [], isEmpty: false,
  // The collection is untimed (its steps carry the time), so it is never "the
  // routine on now": these tests are the trail and the list.
  collections: [{ id: 'home', title: 'Home from school', timeOfDay: null, rows: [r('folder', 'Empty take-home folder', '17:45', true), r('read', 'Reading, 20 minutes — a real book', '17:45')] }],
  bands: { morning: [], afternoon: [], evening: [r('jax', 'Feed Jax dinner', '18:00')], anytime: [] },
}
const NOW = new Date(2026, 9, 20, 17, 52)
const member = { id: 'kaleb', name: 'Kaleb', color: 'orange' }

beforeEach(() => { localStorage.clear(); vi.mocked(playTimerSound).mockClear() })

describe('KidPanelView', () => {
  it('the trail: NOW large, one tap to say it is done', () => {
    const onToggle = vi.fn()
    render(<KidPanelView member={member} layout="trail" panel={buildKidPanel(model, 'kaleb', NOW)} now={NOW} onToggle={onToggle} thoughts={[]} />)
    expect(screen.getByRole('heading', { name: 'Kaleb’s trail' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reading' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next' })).toHaveTextContent('Feed Jax dinner6:00')
    fireEvent.click(screen.getByRole('button', { name: 'I did it' }))
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ key: 'routine:read' }), true)
  })

  it('a stop with minutes starts its own timer, which rings with the chosen sound', () => {
    const { rerender } = render(<KidPanelView member={member} layout="trail" panel={buildKidPanel(model, 'kaleb', NOW)} now={NOW} onToggle={vi.fn()} thoughts={[]} />)
    const realNow = vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime())
    fireEvent.click(screen.getByRole('button', { name: 'Start 20-minute timer' }))
    expect(screen.getByText('20:00')).toBeInTheDocument()
    const later = new Date(NOW.getTime() + 20 * 60_000)
    rerender(<KidPanelView member={member} layout="trail" panel={buildKidPanel(model, 'kaleb', later)} now={later} onToggle={vi.fn()} thoughts={[]} />)
    expect(screen.getByRole('alertdialog', { name: 'Time’s up' })).toBeInTheDocument()
    expect(playTimerSound).toHaveBeenCalledWith('chimes')
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    realNow.mockRestore()
  })

  it('the list: any order, a check per thing, undo by tapping again', () => {
    const onToggle = vi.fn()
    render(<KidPanelView member={{ ...member, name: 'Ella' }} layout="list" panel={buildKidPanel(model, 'kaleb', NOW)} now={NOW} onToggle={onToggle} thoughts={[]} />)
    expect(screen.getByRole('heading', { name: 'Ella’s afternoon' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Feed Jax dinner done' }))
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'routine:jax' }), true)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Empty take-home folder not done' }))
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'routine:folder' }), false)
  })

  it('catches a thought and says it is saved', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(<KidPanelView member={member} layout="trail" panel={buildKidPanel(model, 'kaleb', NOW)} now={NOW} onToggle={vi.fn()} thoughts={[]} onSaveThought={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /Got a thought/ }))
    fireEvent.change(screen.getByPlaceholderText('I’m thinking about…'), { target: { value: 'Build the Lego crane' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do later' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save it for later' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Build the Lego crane', 'later'))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('no thought catcher where there is nowhere to save one', () => {
    render(<KidPanelView member={member} layout="trail" panel={buildKidPanel(model, 'kaleb', NOW)} now={NOW} onToggle={vi.fn()} thoughts={[]} />)
    expect(screen.queryByRole('button', { name: /Got a thought/ })).not.toBeInTheDocument()
  })
})

describe('the routine on now', () => {
  const bedtime: MemberDayModel = {
    ...model,
    collections: [{ id: 'bed', title: 'Kids Bedtime routine', timeOfDay: '19:30', rows: [
      r('shower', 'Shower', null, true), r('towel', 'Hang up your wet towel', null), r('read', 'Wait quietly for Mommy to read', null),
    ] }],
  }
  const TUE_NIGHT = new Date(2026, 9, 20, 19, 32)

  it('replaces the trail with the routine’s checklist, a tap each way', () => {
    const onToggle = vi.fn()
    render(<KidPanelView member={member} layout="trail" panel={buildKidPanel(bedtime, 'kaleb', TUE_NIGHT)} now={TUE_NIGHT} onToggle={onToggle} thoughts={[]} />)
    expect(screen.getByRole('heading', { name: 'Kaleb' })).toBeInTheDocument()
    expect(screen.getByText('Tuesday night')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kids Bedtime routine' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I did it' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Hang up your wet towel done' }))
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'routine:towel' }), true)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Shower not done' }))
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'routine:shower' }), false)
  })

  it('says when it is all done', () => {
    const done = withTicks(bedtime, new Map([['routine:towel', true], ['routine:read', true]]))
    render(<KidPanelView member={member} layout="list" panel={buildKidPanel(done, 'kaleb', TUE_NIGHT)} now={TUE_NIGHT} onToggle={vi.fn()} thoughts={[]} />)
    expect(screen.getByRole('status')).toHaveTextContent('All done')
  })
})

describe('withTicks', () => {
  it('a tap reads at once: NOW moves on before the server answers', () => {
    const ticked = withTicks(model, new Map([['routine:read', true]]))
    expect(buildKidPanel(ticked, 'kaleb', NOW).now?.key).toBe('routine:jax')
  })
})
