import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { PeriodSummaryLine } from './PeriodSummaryLine'

describe('PeriodSummaryLine', () => {
  it('joins planned date, the level’s review and energy in plain words', () => {
    const { container } = render(<PeriodSummaryLine level="week" plannedAt="2026-11-02T10:00" energy={{ level: 'medium' }} reviewed />)
    expect(container.textContent).toBe('Planned Mon, Nov 2 · Last week’s review · Energy: medium')
    expect(container.textContent).not.toMatch(/looked back/i)
  })

  it.each([
    ['day', 'Yesterday’s review'], ['week', 'Last week’s review'], ['month', 'Last month’s review'],
    ['season', 'Last season’s review'], ['year', 'Last year’s review'],
  ] as const)('names the %s review', (level, text) => {
    const { container } = render(<PeriodSummaryLine level={level} reviewed />)
    expect(container.textContent).toBe(text)
  })

  it('shows only what exists', () => {
    const { container } = render(<PeriodSummaryLine level="week" energy={{ level: 'low' }} />)
    expect(container.textContent).toBe('Energy: low')
  })

  it('renders nothing when empty', () => {
    const { container } = render(<PeriodSummaryLine level="week" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the part tapped', () => {
    const onOpen = vi.fn()
    render(<PeriodSummaryLine level="month" energy={{ level: 'high' }} reviewed onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Energy: high' }))
    fireEvent.click(screen.getByRole('button', { name: 'Last month’s review' }))
    expect(onOpen).toHaveBeenNthCalledWith(1, 'energy')
    expect(onOpen).toHaveBeenNthCalledWith(2, 'review')
  })

  it('leaves the date plain text', () => {
    render(<PeriodSummaryLine level="week" plannedAt="2026-11-02T10:00" reviewed onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Planned/ })).toBeNull()
  })

  // Task 4 (2026-11-04): the energy is asked in the Energy step's tooltip; the
  // header line says it, and a tap on it changes it.
  describe('the energy menu', () => {
    const menu = () => within(screen.getByRole('menu', { name: 'Energy' }))
    it('taps open Low · Medium · High · Clear, the saved one checked; a pick saves the level with the words kept', async () => {
      const onEnergy = vi.fn(async () => true)
      render(<PeriodSummaryLine level="day" energy={{ level: 'medium', words: 'New baby' }} onEnergy={onEnergy} />)
      const button = screen.getByRole('button', { name: 'Energy: medium' })
      expect(button).toHaveAttribute('data-guide-anchor', 'energy')
      expect(button).toHaveAttribute('aria-haspopup', 'menu')
      expect(screen.queryByRole('menu')).toBeNull()
      fireEvent.click(button)
      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(menu().getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Low', 'Medium', 'High'])
      expect(menu().getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
      expect(menu().getByRole('menuitem', { name: 'Clear' })).toBeInTheDocument()
      // The saved one has the focus.
      expect(document.activeElement).toBe(menu().getByRole('menuitemradio', { name: 'Medium' }))
      await act(async () => { fireEvent.click(menu().getByRole('menuitemradio', { name: 'High' })) })
      expect(onEnergy).toHaveBeenCalledWith({ level: 'high', words: 'New baby' })
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('Clear removes only the level and keeps the words', async () => {
      const onEnergy = vi.fn(async () => true)
      render(<PeriodSummaryLine level="season" energy={{ level: 'low', words: 'New baby' }} onEnergy={onEnergy} />)
      fireEvent.click(screen.getByRole('button', { name: 'Energy: low' }))
      await act(async () => { fireEvent.click(menu().getByRole('menuitem', { name: 'Clear' })) })
      expect(onEnergy).toHaveBeenCalledWith({ words: 'New baby' })
    })

    it('Clear with no words removes the note', async () => {
      const onEnergy = vi.fn(async () => true)
      render(<PeriodSummaryLine level="day" energy={{ level: 'low' }} onEnergy={onEnergy} />)
      fireEvent.click(screen.getByRole('button', { name: 'Energy: low' }))
      await act(async () => { fireEvent.click(menu().getByRole('menuitem', { name: 'Clear' })) })
      expect(onEnergy).toHaveBeenCalledWith(undefined)
    })

    it('arrow keys move through it; Escape closes it and gives the focus back, and is not passed on', () => {
      const outer = vi.fn()
      document.addEventListener('keydown', outer)
      try {
        render(<PeriodSummaryLine level="day" energy={{ level: 'low' }} onEnergy={vi.fn(async () => true)} />)
        const button = screen.getByRole('button', { name: 'Energy: low' })
        fireEvent.click(button)
        expect(document.activeElement).toHaveTextContent('Low')
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
        expect(document.activeElement).toHaveTextContent('Medium')
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
        expect(document.activeElement).toHaveTextContent('Clear')
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
        expect(screen.queryByRole('menu')).toBeNull()
        expect(document.activeElement).toBe(button)
        // The tooltip's own Escape (GuideCoach) leaves a handled one alone.
        expect(outer.mock.calls.at(-1)?.[0].defaultPrevented).toBe(true)
      } finally { document.removeEventListener('keydown', outer) }
    })

    it('an outside click closes it without saving', () => {
      const onEnergy = vi.fn(async () => true)
      render(<><PeriodSummaryLine level="day" energy={{ level: 'low' }} onEnergy={onEnergy} /><p>elsewhere</p></>)
      fireEvent.click(screen.getByRole('button', { name: 'Energy: low' }))
      fireEvent.pointerDown(screen.getByText('elsewhere'))
      expect(screen.queryByRole('menu')).toBeNull()
      expect(onEnergy).not.toHaveBeenCalled()
    })

    it('a save that did not land says so', async () => {
      render(<PeriodSummaryLine level="day" energy={{ level: 'low' }} onEnergy={vi.fn(async () => false)} />)
      fireEvent.click(screen.getByRole('button', { name: 'Energy: low' }))
      await act(async () => { fireEvent.click(menu().getByRole('menuitemradio', { name: 'High' })) })
      expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save')
    })

    it('says nothing of energy with no level set, words or not', () => {
      const { container } = render(<PeriodSummaryLine level="day" energy={{ words: 'New baby' }} onEnergy={vi.fn(async () => true)} />)
      expect(container).toBeEmptyDOMElement()
    })
  })
})
