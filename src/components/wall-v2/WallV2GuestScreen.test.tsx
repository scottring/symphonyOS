import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { Sun } from 'lucide-react'
import { WallV2GuestScreen } from './WallV2GuestScreen'

describe('WallV2GuestScreen', () => {
  const base = {
    time: '9:41 AM', weekday: 'Sunday', fullDate: 'May 24, 2026',
    temp: 54, condition: 'Rain', weatherIcon: Sun,
  }

  it('shows only time/date/weather (no private content) and exits on tap', async () => {
    const onExit = vi.fn()
    const { user } = render(<WallV2GuestScreen {...base} onExit={onExit} />)
    expect(screen.getByText('9:41 AM')).toBeInTheDocument()
    expect(screen.getByText(/Sunday, May 24, 2026/)).toBeInTheDocument()
    expect(screen.getByText('54°')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /exit guest mode/i }))
    expect(onExit).toHaveBeenCalled()
  })
})
