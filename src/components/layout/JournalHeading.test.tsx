import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { JournalHeading } from './JournalHeading'

const base = { title: 'November 2026', onPrev: vi.fn(), onNext: vi.fn(), prevLabel: 'Previous month', nextLabel: 'Next month' }

describe('JournalHeading — the way back to now (Scott, 2026-11-11)', () => {
  it('shows no pill on the current period', () => {
    render(<JournalHeading {...base} />)
    expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull()
  })

  it('away from it, a pill after the arrows goes back', () => {
    const onGo = vi.fn()
    render(<JournalHeading {...base} current={{ label: 'This month', ariaLabel: 'Go to this month', onGo }} />)
    const pill = screen.getByRole('button', { name: 'Go to this month' })
    expect(pill).toHaveTextContent('This month')
    // After the next arrow, so the arrows stay put as it comes and goes.
    const buttons = screen.getAllByRole('button')
    expect(buttons.indexOf(pill)).toBe(buttons.findIndex((b) => b.getAttribute('aria-label') === 'Next month') + 1)
    fireEvent.click(pill)
    expect(onGo).toHaveBeenCalledOnce()
  })
})

describe('JournalHeading — stacked (Today, Scott 2026-11-13)', () => {
  it('puts the month and year over the weekday, with no comma between them', () => {
    render(<JournalHeading {...base} numeral="13" tag={<span>Friday</span>} stacked />)
    const heading = screen.getByTestId('journal-heading')
    expect(heading).toHaveClass('is-stacked')
    const stack = heading.querySelector('.journal-stack')!
    expect(stack).toContainElement(screen.getByRole('heading', { name: 'November 2026' }))
    expect(stack).toHaveTextContent(/^November 2026Friday$/)
  })

  it('keeps the one line, comma and all, when not stacked', () => {
    render(<JournalHeading {...base} numeral="13" tag={<span>Friday</span>} />)
    expect(screen.getByTestId('journal-heading').querySelector('.journal-stack')).toBeNull()
    expect(screen.getByTestId('journal-heading')).toHaveTextContent('November 2026,Friday')
  })
})
