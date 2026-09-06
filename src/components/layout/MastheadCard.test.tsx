import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MastheadCard, PeriodNavEyebrow } from './MastheadCard'

vi.mock('@/components/place/PlaceWash', () => ({ PlaceWash: () => <div data-testid="place-wash" /> }))

describe('MastheadCard', () => {
  // One masthead shape for every planning page: eyebrow nav, serif title, a
  // quiet line, chrome in the corner, the page's controls along the foot.
  it('lays out its five slots and wears the Place', () => {
    render(
      <MastheadCard
        eyebrow={<span>Eyebrow</span>}
        title="Good morning"
        subline={<span>Next: cleats</span>}
        controls={<button type="button">Chrome</button>}
        footer={<button type="button">Foot</button>}
      />,
    )
    const card = screen.getByTestId('masthead-card')
    expect(within(card).getByRole('heading', { level: 1, name: 'Good morning' })).toBeInTheDocument()
    expect(within(screen.getByTestId('masthead-eyebrow')).getByText('Eyebrow')).toBeInTheDocument()
    expect(within(card).getByText('Next: cleats')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Chrome' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Foot' })).toBeInTheDocument()
    expect(within(card).getByTestId('place-wash')).toBeInTheDocument()
  })

  it('renders only the title when the other slots are absent', () => {
    render(<MastheadCard title="This Month" />)
    expect(screen.getByRole('heading', { level: 1, name: 'This Month' })).toBeInTheDocument()
    expect(screen.queryByTestId('masthead-eyebrow')).not.toBeInTheDocument()
  })
})

describe('PeriodNavEyebrow', () => {
  it('names the period and steps either way', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(<PeriodNavEyebrow label="September 2026" onPrev={onPrev} onNext={onNext} prevLabel="Previous month" nextLabel="Next month" />)
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Previous month'))
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
