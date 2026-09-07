import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallV2Strip } from './WallV2Strip'
import { WallV2UtilitySheet } from './WallV2UtilitySheet'

const stripProps = {
  tonight: 'Grilled pizza night',
  meals: [],
  due: [],
  comingUp: [],
  question: null,
  onCall: vi.fn(),
}

// Scott, 2026-09-07: "can we give the recipe search functionality its own
// button instead of burying it in utilities?" Cooking is a thing you come to
// the wall to do; the utilities drawer is where you change the theme.
describe('the recipe door', () => {
  it('is a tile in the strip, beside Call', () => {
    const onBrowseRecipes = vi.fn()
    render(<WallV2Strip {...stripProps} onBrowseRecipes={onBrowseRecipes} />)

    const tile = screen.getByRole('button', { name: 'Recipes' })
    fireEvent.click(tile)
    expect(onBrowseRecipes).toHaveBeenCalled()
    // The Call tile's twin: full strip height, well past the 80px minimum.
    expect(tile.className).toContain('w-[140px]')
  })

  it('is not in the utilities drawer any more', () => {
    render(
      <WallV2UtilitySheet
        hideRoutines={false} isDark={false} refreshing={false}
        onGuestMode={vi.fn()} onRefresh={vi.fn()} onToggleHideRoutines={vi.fn()}
        onToggleTheme={vi.fn()} onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('Recipes')).not.toBeInTheDocument()
  })

  it('leaves the strip alone on a wall with no picker wired up', () => {
    render(<WallV2Strip {...stripProps} />)
    expect(screen.queryByRole('button', { name: 'Recipes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Call' })).toBeInTheDocument()
  })
})
