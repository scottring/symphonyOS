import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuideHeader } from './GuideHeader'
import { SessionBar } from './SessionBar'
import { stepsFor } from '@/lib/guide/steps'

const step = stepsFor('week')[1]
const base = { level: 'week' as const, step, index: 1, total: 7, onNext: vi.fn(), onSkip: vi.fn(), isLast: false, finishLabel: 'Done planning the week', onFinish: vi.fn() }

describe('GuideHeader', () => {
  it('shows title, why, you and guide', () => {
    render(<GuideHeader {...base} />)
    expect(screen.getByText(step.title)).toBeInTheDocument()
    expect(screen.getByText(step.why)).toBeInTheDocument()
    expect(screen.getByText(step.you)).toBeInTheDocument()
    expect(screen.getByText(step.guide)).toBeInTheDocument()
    expect(screen.getByText(/step 2 of 7/i)).toBeInTheDocument()
  })

  it('reveals more inline', () => {
    render(<GuideHeader {...base} />)
    expect(screen.queryByText(step.more)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Explain more' }))
    expect(screen.getByText(step.more)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.queryByText(step.more)).toBeNull()
  })

  it('calls next and skip', () => {
    render(<GuideHeader {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }))
    expect(base.onNext).toHaveBeenCalled()
    expect(base.onSkip).toHaveBeenCalled()
  })

  it('uses the finish label on the last step', () => {
    const onFinish = vi.fn()
    render(<GuideHeader {...base} isLast onFinish={onFinish} />)
    expect(screen.queryByRole('button', { name: 'Next step' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done planning the week' }))
    expect(onFinish).toHaveBeenCalled()
  })
})

describe('SessionBar', () => {
  it('reads label, step and Leave', () => {
    const onLeave = vi.fn()
    const { container } = render(<SessionBar label="Planning the week" index={4} total={7} onLeave={onLeave} />)
    expect(container.textContent).toBe('Planning the week · step 5 of 7 · Leave')
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onLeave).toHaveBeenCalled()
  })
})
