import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Hint } from './Hint'
import { HINT_SEEN_KEY } from '@/lib/planning/hints'

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

describe('Hint', () => {
  it('shows once, with the given copy', () => {
    render(<Hint name="month-goals" uid="u1">Goals are what this period should add up to.</Hint>)
    expect(screen.getByRole('note')).toHaveTextContent('Goals are what this period should add up to.')
  })

  it('"Got it" hides it and writes the key', () => {
    render(<Hint name="month-goals" uid="u1">Some copy</Hint>)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(localStorage.getItem(HINT_SEEN_KEY('month-goals', 'u1'))).toBe('1')
  })

  it('a seen key hides it on mount', () => {
    localStorage.setItem(HINT_SEEN_KEY('month-goals', 'u1'), '1')
    render(<Hint name="month-goals" uid="u1">Some copy</Hint>)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('keys are per uid', () => {
    localStorage.setItem(HINT_SEEN_KEY('month-goals', 'u1'), '1')
    render(<Hint name="month-goals" uid="u2">Some copy</Hint>)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('a null uid still renders, keyed under "anon"', () => {
    render(<Hint name="month-goals" uid={null}>Some copy</Hint>)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(localStorage.getItem(HINT_SEEN_KEY('month-goals', null))).toBe('1')
  })
})
