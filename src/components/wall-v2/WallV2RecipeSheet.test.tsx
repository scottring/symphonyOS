import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { WallV2RecipeSheet } from './WallV2RecipeSheet'
import type { WallRecipe } from '@/lib/wall/recipeSearch'

function r(title: string, over: Partial<WallRecipe> = {}): WallRecipe {
  return { id: title.toLowerCase().replace(/\W+/g, '-'), title, tags: [], lastCookedAt: null, prepMinutes: null, ...over }
}

// Twelve, so paging is real: the wall shows nine.
const SHELF = [
  'Arugula salad', 'Beef stew', 'Chicken piccata', 'Dal', 'Enchiladas', 'Falafel',
  'Grilled pizza night', 'Hummus', 'Israeli salad', 'Jerk chicken', 'Kale caesar', 'Lasagne',
].map((t) => r(t))

/** The host owns the query (so Back from a recipe keeps it); stand in for it. */
function Host(props: Partial<React.ComponentProps<typeof WallV2RecipeSheet>>) {
  const [query, setQuery] = useState('')
  return (
    <WallV2RecipeSheet
      recipes={SHELF} loading={false} onPick={vi.fn()} onClose={vi.fn()}
      query={query} onQueryChange={setQuery} {...props}
    />
  )
}

function renderSheet(props: Partial<React.ComponentProps<typeof WallV2RecipeSheet>> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<Host onPick={onPick} onClose={onClose} {...props} />)
  return { onPick, onClose }
}

describe('WallV2RecipeSheet', () => {
  // There is no keyboard at the wall. The keys are the input.
  it('types with its own keys and narrows as it goes', () => {
    renderSheet()
    expect(screen.getByText('Beef stew')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    expect(screen.getByText('Chicken piccata')).toBeInTheDocument()
    expect(screen.queryByText('Beef stew')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Backspace' }))
    expect(screen.getByText('Beef stew')).toBeInTheDocument()
  })

  it('shows nine at a time and pages the rest — a wall never scrolls', () => {
    renderSheet()
    expect(screen.getByText('Arugula salad')).toBeInTheDocument()
    expect(screen.queryByText('Kale caesar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Kale caesar')).toBeInTheDocument()
    expect(screen.queryByText('Arugula salad')).not.toBeInTheDocument()
  })

  it('goes back to the first page when the search changes, not to an empty one', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'H' }))
    expect(screen.getByText('Hummus')).toBeInTheDocument()
  })

  it('says so plainly when nothing matches, and offers the way back', () => {
    renderSheet()
    // Q appears in none of these titles — Z would have matched "Grilled pizza
    // night", which is the substring rule working, not a miss.
    fireEvent.click(screen.getByRole('button', { name: 'Q' }))
    expect(screen.getByText('Nothing by that name.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(screen.getByText('Arugula salad')).toBeInTheDocument()
  })

  it('hands the picked recipe over', () => {
    const { onPick } = renderSheet()
    fireEvent.click(screen.getByText('Dal'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dal' }))
  })

  it('page arrows are disabled at the ends, never hidden — the grid must not resize under a finger', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).not.toBeDisabled()
  })

  // The kiosk contract, asserted rather than trusted: every key and every
  // tile is a real target for a standing adult or a six-year-old.
  it('gives every key an 80px touch target', () => {
    renderSheet()
    for (const name of ['A', 'M', 'Z', 'Space', 'Backspace', 'Clear', 'Close']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/h-20|w-20/)
    }
  })

  // Coming back from a recipe must land on the search you made. The sheet
  // unmounts while the cooking view is up, so the query cannot live in it.
  it('takes its query from the host and hands every change back', () => {
    const onQueryChange = vi.fn()
    render(
      <WallV2RecipeSheet
        recipes={SHELF} loading={false} onPick={vi.fn()} onClose={vi.fn()}
        query="be" onQueryChange={onQueryChange}
      />,
    )
    expect(screen.getByText('Beef stew')).toBeInTheDocument()
    expect(screen.queryByText('Arugula salad')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'E' }))
    expect(onQueryChange).toHaveBeenCalledWith('beE')
  })

  it('closes on the scrim as well as the button', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByTestId('recipe-scrim'))
    expect(onClose).toHaveBeenCalled()
  })

  it('counts what it found, so you know before you read', () => {
    renderSheet()
    expect(screen.getByText('12 matches')).toBeInTheDocument()
    // "Dal" alone: a bare D also finds the d inside Enchiladas and Grilled.
    fireEvent.click(screen.getByRole('button', { name: 'D' }))
    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    fireEvent.click(screen.getByRole('button', { name: 'L' }))
    expect(screen.getByText('1 match')).toBeInTheDocument()
  })

  it('waits without lying when the shelf is still loading', () => {
    render(<Host recipes={[]} loading />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Nothing by that name.')).not.toBeInTheDocument()
  })
})

describe('WallV2RecipeSheet — what it shows about a recipe', () => {
  it('carries the minutes and when it was last cooked', () => {
    render(
      <Host recipes={[r('Shakshuka', { prepMinutes: 25, lastCookedAt: new Date(2026, 8, 1) })]} />,
    )
    const tile = screen.getByText('Shakshuka').closest('button')!
    expect(within(tile).getByText('25 min · Cooked Sep 1')).toBeInTheDocument()
  })
})
