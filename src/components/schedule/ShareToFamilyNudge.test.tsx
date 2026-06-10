import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareToFamilyNudge } from './ShareToFamilyNudge'

describe('ShareToFamilyNudge', () => {
  it('renders the prompt with the context label', () => {
    render(<ShareToFamilyNudge contextLabel="work" onAdd={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/work event is during family time/i)).toBeInTheDocument()
  })
  it('fires onAdd and onDismiss', () => {
    const onAdd = vi.fn()
    const onDismiss = vi.fn()
    render(<ShareToFamilyNudge contextLabel="work" onAdd={onAdd} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /add to family timeline/i }))
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
