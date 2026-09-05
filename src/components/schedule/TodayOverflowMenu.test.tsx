import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TodayOverflowMenu } from './TodayOverflowMenu'

describe('TodayOverflowMenu', () => {
  it('hides its controls until asked, then closes after a pick', () => {
    render(
      <TodayOverflowMenu>
        <button type="button">Print list</button>
      </TodayOverflowMenu>
    )
    expect(screen.queryByText('Print list')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More controls' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Print list'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('escapes the page stacking order: the menu is fixed at the pickers\' level, not absolute in the header', () => {
    // Rows' rail cells sit at z-[9999] and paint after the header, so an
    // `absolute z-50` menu ended up under their avatars.
    render(<TodayOverflowMenu><span>x</span></TodayOverflowMenu>)
    fireEvent.click(screen.getByRole('button', { name: 'More controls' }))
    const menu = screen.getByRole('menu')
    expect(menu.className).toContain('fixed')
    expect(menu.className).toContain('z-[9999]')
    expect(menu.className).not.toContain('absolute')
  })
})
