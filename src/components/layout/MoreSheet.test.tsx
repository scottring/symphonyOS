import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { MoreSheet } from './MoreSheet'
function Location() { return <p>{useLocation().pathname}</p> }
describe('Phone secondary destinations', () => {
  it.each([['Someday', '/someday']])('opens %s from More and closes the sheet', (label, route) => {
    const close = vi.fn()
    render(<MemoryRouter><MoreSheet isOpen onClose={close} onNavigate={vi.fn()} activeView="today" /><Location /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByText(route)).toBeInTheDocument()
    expect(close).toHaveBeenCalledOnce()
  })
})
