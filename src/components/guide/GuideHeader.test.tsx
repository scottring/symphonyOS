import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuideHeader } from './GuideHeader'
import { SessionBar } from './SessionBar'
import { stepsFor } from '@/lib/guide/steps'
import { AssistantLaunchProvider, useAssistantLaunchRequests } from '@/contexts/AssistantLaunchContext'

const phone = vi.hoisted(() => ({ on: false }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => phone.on }))

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

  it('compact (the phone page): title and the step buttons, Why/You/Guide behind Explain', () => {
    render(<GuideHeader {...base} compact />)
    expect(screen.getByText(step.title)).toBeInTheDocument()
    expect(screen.queryByText(step.why)).toBeNull()
    expect(screen.queryByText(step.you)).toBeNull()
    expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip this step' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }))
    expect(screen.getByText(step.why)).toBeInTheDocument()
    expect(screen.getByText(step.you)).toBeInTheDocument()
    expect(screen.getByText(step.guide)).toBeInTheDocument()
    expect(screen.getByText(step.more)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.queryByText(step.why)).toBeNull()
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
  afterEach(() => { phone.on = false })
  it('reads label, step and Leave', () => {
    const onLeave = vi.fn()
    const { container } = render(<SessionBar label="Planning the week" index={4} total={7} onLeave={onLeave} />)
    expect(container.textContent).toBe('Planning the week · step 5 of 7 · Leave')
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onLeave).toHaveBeenCalled()
  })
  it('on a phone, "Talk to the guide" opens the conversation', () => {
    phone.on = true
    const seen: number[] = []
    function Launches() { seen.push(useAssistantLaunchRequests().nonce); return null }
    render(<AssistantLaunchProvider><SessionBar label="Planning the week" index={0} total={7} onLeave={vi.fn()} /><Launches /></AssistantLaunchProvider>)
    expect(seen.at(-1)).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Talk to the guide' }))
    expect(seen.at(-1)).toBe(1)
  })
  it('on desktop there is no Talk button (the conversation is beside the page)', () => {
    render(<SessionBar label="Planning the week" index={0} total={7} onLeave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Talk to the guide' })).toBeNull()
  })
})
