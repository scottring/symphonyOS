import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { EndOfDayCard } from './EndOfDayCard'

describe('EndOfDayCard', () => {
  it('renders the title and supporting text', () => {
    render(<EndOfDayCard onOpenReview={() => {}} />)
    expect(screen.getByText('End of day review')).toBeInTheDocument()
    expect(screen.getByText(/reflect, prep for tomorrow/i)).toBeInTheDocument()
  })

  it('calls onOpenReview when clicked', async () => {
    const onOpenReview = vi.fn()
    const { user } = render(<EndOfDayCard onOpenReview={onOpenReview} />)
    await user.click(screen.getByRole('button', { name: /end of day review/i }))
    expect(onOpenReview).toHaveBeenCalledTimes(1)
  })
})
