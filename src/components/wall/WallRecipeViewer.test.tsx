import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallRecipeViewer } from './WallRecipeViewer'

const CONTENT = {
  title: 'Chicken Piccata',
  ingredients: ['1 lb chicken', '2 lemons'],
  instructions: ['Sear the chicken.', 'Add lemon.'],
}

function setup(over: Partial<React.ComponentProps<typeof WallRecipeViewer>> = {}) {
  const onPrevDay = vi.fn()
  const onNextDay = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <WallRecipeViewer
      content={CONTENT}
      mealName="Chicken Piccata"
      mealIcon="🍝"
      dayLabel="Tonight"
      prevDay={{ label: 'Tue, Aug 4', title: 'Fish Tacos' }}
      nextDay={{ label: 'Thu, Aug 6', title: 'Sheet-pan Salmon' }}
      onPrevDay={onPrevDay}
      onNextDay={onNextDay}
      onClose={onClose}
      {...over}
    />,
  )
  return { ...utils, onPrevDay, onNextDay, onClose }
}

function swipe(el: Element, dx: number, dy: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 300 }] })
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] })
}

describe('WallRecipeViewer day paging', () => {
  it('shows a rail per neighbouring day, naming the day and the meal', () => {
    setup()
    const prev = screen.getByRole('button', { name: /Previous day: Tue, Aug 4, Fish Tacos/ })
    const next = screen.getByRole('button', { name: /Next day: Thu, Aug 6, Sheet-pan Salmon/ })
    expect(prev).toBeInTheDocument()
    expect(next).toBeInTheDocument()
    // The cook needs to read where the arrow goes before committing to the tap.
    expect(prev).toHaveTextContent('Fish Tacos')
    expect(next).toHaveTextContent('Sheet-pan Salmon')
  })

  it('pages on tap', () => {
    const { onPrevDay, onNextDay } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Previous day/ }))
    expect(onPrevDay).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Next day/ }))
    expect(onNextDay).toHaveBeenCalledTimes(1)
  })

  it('hides the rail at either end of the plan', () => {
    setup({ prevDay: null, nextDay: null })
    expect(screen.queryByRole('button', { name: /Previous day/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Next day/ })).not.toBeInTheDocument()
  })

  it('shows which day is on screen', () => {
    setup({ dayLabel: 'Wed, Aug 5' })
    expect(screen.getByText('Wed, Aug 5')).toBeInTheDocument()
  })

  it('swipes left for the next day and right for the previous', () => {
    const { container, onPrevDay, onNextDay } = setup()
    swipe(container.firstElementChild!, -140, 0)
    expect(onNextDay).toHaveBeenCalledTimes(1)
    swipe(container.firstElementChild!, 140, 0)
    expect(onPrevDay).toHaveBeenCalledTimes(1)
  })

  it('ignores a short drag and a mostly-vertical one, so scrolling the steps does not page', () => {
    const { container, onPrevDay, onNextDay } = setup()
    swipe(container.firstElementChild!, -40, 0)      // too short
    swipe(container.firstElementChild!, -90, 200)    // mostly vertical
    expect(onNextDay).not.toHaveBeenCalled()
    expect(onPrevDay).not.toHaveBeenCalled()
  })

  it('does not swipe past the end of the plan', () => {
    const { container, onNextDay } = setup({ nextDay: null })
    swipe(container.firstElementChild!, -140, 0)
    expect(onNextDay).not.toHaveBeenCalled()
  })

  it('starts the new day with an unchecked ingredient list', () => {
    const { rerender } = setup()
    fireEvent.click(screen.getByRole('button', { name: /1 lb chicken/ }))
    expect(screen.getByText('1/2')).toBeInTheDocument()

    rerender(
      <WallRecipeViewer
        content={{ title: 'Fish Tacos', ingredients: ['1 lb cod', '8 tortillas'], instructions: ['Fry.'] }}
        mealName="Fish Tacos"
        mealIcon="🌮"
        dayLabel="Tue, Aug 4"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('0/2')).toBeInTheDocument()
  })
})
