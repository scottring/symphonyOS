import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GuideRail } from './GuideRail'
import { stepsFor } from '@/lib/guide/steps'

const steps = stepsFor('week')
const bodies = Object.fromEntries(steps.map(s => [s.id, <p key={s.id}>body of {s.id}</p>]))

function setup(progress = { current: steps[2].id, done: [steps[0].id], skipped: [steps[1].id] }) {
  const onJump = vi.fn()
  render(<GuideRail level="week" progress={progress} bodies={bodies} onJump={onJump} />)
  return onJump
}

describe('GuideRail', () => {
  it('marks done, current and skipped steps', () => {
    setup()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveAttribute('data-state', 'done')
    expect(items[1]).toHaveAttribute('data-state', 'skipped')
    expect(items[2]).toHaveAttribute('data-state', 'current')
    expect(within(items[2]).getByRole('button')).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveTextContent('(done)')
    expect(items[1]).toHaveTextContent('(skipped)')
    expect(items[3]).toHaveAttribute('data-state', 'todo')
  })

  it('renders only the current step body', () => {
    setup()
    expect(screen.getByText(`body of ${steps[2].id}`)).toBeInTheDocument()
    expect(screen.queryByText(`body of ${steps[0].id}`)).toBeNull()
    expect(screen.queryByText(`body of ${steps[3].id}`)).toBeNull()
  })

  it('shows why for a tapped other step and jumps on request', () => {
    const onJump = setup()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(steps[4].title) }))
    expect(screen.getByText(steps[4].why)).toBeInTheDocument()
    expect(onJump).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Go to this step' }))
    expect(onJump).toHaveBeenCalledWith(steps[4].id)
  })

  it('uses titleFor when given', () => {
    render(<GuideRail level="week" progress={{ current: steps[0].id, done: [], skipped: [] }} bodies={{}} titleFor={() => 'Custom'} onJump={() => {}} />)
    expect(screen.getAllByText('Custom').length).toBe(steps.length)
  })

  it('closes a previewed step when the current step changes', () => {
    const p = { current: steps[2].id, done: [], skipped: [] }
    const { rerender } = render(<GuideRail level="week" progress={p} bodies={bodies} onJump={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(steps[4].title) }))
    expect(screen.getByText(steps[4].why)).toBeInTheDocument()
    rerender(<GuideRail level="week" progress={{ ...p, current: steps[3].id }} bodies={bodies} onJump={() => {}} />)
    expect(screen.queryByText(steps[4].why)).toBeNull()
  })
})
