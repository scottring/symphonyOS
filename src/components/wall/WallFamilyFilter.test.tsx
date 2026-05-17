import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallFamilyFilter } from './WallFamilyFilter'
import { createMockFamilyMember } from '@/test/mocks/factories'

const members = [
  createMockFamilyMember({ id: 'm1', name: 'Scott' }),
  createMockFamilyMember({ id: 'm2', name: 'Iris' }),
  createMockFamilyMember({ id: 'm3', name: 'Mia' }),
]

describe('WallFamilyFilter', () => {
  it('renders an avatar per member plus ALL button', () => {
    render(<WallFamilyFilter members={members} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /scott/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iris/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mia/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
  })

  it('marks ALL as selected when selectedId is null', () => {
    render(<WallFamilyFilter members={members} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks the member as selected when selectedId matches', () => {
    render(<WallFamilyFilter members={members} selectedId="m2" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /iris/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect with the id on tap', () => {
    const onSelect = vi.fn()
    render(<WallFamilyFilter members={members} selectedId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /mia/i }))
    expect(onSelect).toHaveBeenCalledWith('m3')
  })

  it('ALL button calls onSelect with null', () => {
    const onSelect = vi.fn()
    render(<WallFamilyFilter members={members} selectedId="m2" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
