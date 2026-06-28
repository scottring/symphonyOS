import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClarityCurtain } from './ClarityCurtain'
import { computeClaritySteps } from '@/lib/clarity/claritySteps'

const clearResult = computeClaritySteps({ inboxCount: 0, overdueCount: 0, placeableCount: 0, isEvening: false })
const busyResult = computeClaritySteps({ inboxCount: 2, overdueCount: 0, placeableCount: 3, isEvening: false })

describe('ClarityCurtain', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ClarityCurtain open={false} onClose={() => {}} result={busyResult} onStepAction={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the warm rest state when all clear', () => {
    render(<ClarityCurtain open onClose={() => {}} result={clearResult} onStepAction={() => {}} />)
    expect(screen.getByText("You're clear")).toBeInTheDocument()
  })

  it('highlights the next move and fires its action + closes', async () => {
    const onStepAction = vi.fn()
    const onClose = vi.fn()
    render(<ClarityCurtain open onClose={onClose} result={busyResult} onStepAction={onStepAction} />)
    expect(screen.getByText('Your next move')).toBeInTheDocument()
    // inbox is the next move (inboxCount 2); its action is "Open inbox"
    await userEvent.click(screen.getByRole('button', { name: /Open inbox/ }))
    expect(onStepAction).toHaveBeenCalledWith('inbox')
    expect(onClose).toHaveBeenCalled()
  })

  it('lets you act on a still-ahead (todo) step too', async () => {
    const onStepAction = vi.fn()
    render(<ClarityCurtain open onClose={() => {}} result={busyResult} onStepAction={onStepAction} />)
    // plan is 'todo' here; its label "Plan your day" is tappable
    await userEvent.click(screen.getByRole('button', { name: /Plan your day/ }))
    expect(onStepAction).toHaveBeenCalledWith('plan')
  })
})
