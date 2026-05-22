import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeeklyPlanningSession } from './WeeklyPlanningSession'

const baseProps = {
  tasks: [], events: [], routines: [],
  onUpdateTask: vi.fn(), onPushTask: vi.fn(),
  onSavePlanToVault: vi.fn().mockResolvedValue({ ok: true }),
  onClose: vi.fn(),
}

describe('WeeklyPlanningSession', () => {
  it('starts on step 1 of 4 and advances with Next', async () => {
    const { user } = render(<WeeklyPlanningSession {...baseProps} />)
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
  })

  it('shows Finish on the last step and calls onSavePlanToVault', async () => {
    const onSavePlanToVault = vi.fn().mockResolvedValue({ ok: true })
    const { user } = render(<WeeklyPlanningSession {...baseProps} onSavePlanToVault={onSavePlanToVault} />)
    await user.click(screen.getByRole('button', { name: /next/i })) // 2
    await user.click(screen.getByRole('button', { name: /next/i })) // 3
    await user.click(screen.getByRole('button', { name: /next/i })) // 4
    await user.click(screen.getByRole('button', { name: /finish/i }))
    expect(onSavePlanToVault).toHaveBeenCalled()
  })
})
