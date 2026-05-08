import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReferenceFactsCard } from './ReferenceFactsCard'
import type { Fact } from '@/types/home'

const facts: Fact[] = [
  { type: 'wifi', label: 'Guest WiFi', value: 'stax-guest / pwd' },
  { type: 'paint', label: 'Wall', value: 'BM Cloud White' },
]

describe('ReferenceFactsCard', () => {
  it('renders all facts', () => {
    render(<ReferenceFactsCard spaceId="s1" facts={facts} updateSpace={vi.fn()} />)
    expect(screen.getByText('Guest WiFi')).toBeInTheDocument()
    expect(screen.getByText('BM Cloud White')).toBeInTheDocument()
  })

  it('add button opens the new-fact form', () => {
    render(<ReferenceFactsCard spaceId="s1" facts={[]} updateSpace={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add fact/i }))
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  it('saving a new fact calls updateSpace', () => {
    const updateSpace = vi.fn().mockResolvedValue(undefined)
    render(<ReferenceFactsCard spaceId="s1" facts={[]} updateSpace={updateSpace} />)
    fireEvent.click(screen.getByRole('button', { name: /add fact/i }))
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'WiFi' } })
    fireEvent.change(screen.getByLabelText(/value/i), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updateSpace).toHaveBeenCalledWith('s1', expect.objectContaining({
      facts: [{ type: 'wifi', label: 'WiFi', value: 'pw' }],
    }))
  })
})
