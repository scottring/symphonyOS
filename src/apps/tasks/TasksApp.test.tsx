import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

function passthrough({ children }: { children: ReactNode }) { return children }
vi.mock('@/contexts/ListsContext', () => ({ ListsProvider: passthrough }))
vi.mock('@/contexts/NotesContext', () => ({ NotesProvider: passthrough }))
vi.mock('@/contexts/GoalsContext', () => ({ GoalsProvider: passthrough }))
vi.mock('@/hooks/useScratchpadHidden', () => ({ useScratchpadHidden: () => ({ hidden: true, setHidden: vi.fn() }) }))
vi.mock('./InboxViewContainer', () => ({ InboxViewContainer: () => null }))
vi.mock('./TaskViewRoute', () => ({ TaskViewRoute: () => null }))
vi.mock('./SomedayPage', () => ({ SomedayPage: () => null }))
vi.mock('./HomeViewContainer', () => ({ HomeViewContainer: ({ fixedView }: { fixedView?: string }) => {
  const [date, setDate] = useState('current day')
  const navigate = useNavigate()
  return <><p>{fixedView ?? 'today'}: {date}</p><button onClick={() => setDate('week Sunday')}>Browse week</button><button onClick={() => navigate('/today')}>Today destination</button></>
} }))

import { TasksApp } from './TasksApp'

describe('TasksApp horizon navigation', () => {
  it('starts Today fresh instead of inheriting the browsed Week date', () => {
    render(<MemoryRouter initialEntries={['/week']}><TasksApp /></MemoryRouter>)
    fireEvent.click(screen.getByText('Browse week'))
    expect(screen.getByText('week: week Sunday')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Today destination'))
    expect(screen.getByText('today: current day')).toBeInTheDocument()
  })
})
