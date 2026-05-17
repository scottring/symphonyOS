import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusInboxCard } from './FocusInboxCard'
import { createMockTask } from '@/test/mocks/factories'

const tasks = [
  createMockTask({ id: 'a', title: 'First task' }),
  createMockTask({ id: 'b', title: 'Second task' }),
  createMockTask({ id: 'c', title: 'Third task' }),
]

describe('FocusInboxCard', () => {
  const baseProps = {
    tasks,
    projects: [],
    familyMembers: [],
    onTriage: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onSelectDetail: vi.fn(),
    onExitFocus: vi.fn(),
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders the first task title and progress', () => {
    render(<FocusInboxCard {...baseProps} />)
    expect(screen.getByText('First task')).toBeInTheDocument()
    expect(screen.getByText(/card 1 of 3/i)).toBeInTheDocument()
  })

  it('calls onTriage with today bucket when "1" pressed', () => {
    const onTriage = vi.fn()
    render(<FocusInboxCard {...baseProps} onTriage={onTriage} />)
    fireEvent.keyDown(window, { key: '1' })
    expect(onTriage).toHaveBeenCalledWith('a', 'today')
  })

  it('calls onTriage with week, month, someday for 2/3/4', () => {
    const onTriage = vi.fn()
    render(<FocusInboxCard {...baseProps} onTriage={onTriage} />)
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: '3' })
    fireEvent.keyDown(window, { key: '4' })
    expect(onTriage).toHaveBeenNthCalledWith(1, 'a', 'week')
    expect(onTriage).toHaveBeenNthCalledWith(2, 'b', 'month')
    expect(onTriage).toHaveBeenNthCalledWith(3, 'c', 'quarter')
  })

  it('auto-advances after triage', () => {
    render(<FocusInboxCard {...baseProps} />)
    expect(screen.getByText('First task')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '1' })
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('calls onDelete and advances when "d" pressed', () => {
    const onDelete = vi.fn()
    render(<FocusInboxCard {...baseProps} onDelete={onDelete} />)
    fireEvent.keyDown(window, { key: 'd' })
    expect(onDelete).toHaveBeenCalledWith('a')
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('skips forward on ArrowRight without triaging', () => {
    const onTriage = vi.fn()
    render(<FocusInboxCard {...baseProps} onTriage={onTriage} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onTriage).not.toHaveBeenCalled()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('goes back on ArrowLeft', () => {
    render(<FocusInboxCard {...baseProps} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Second task')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('First task')).toBeInTheDocument()
  })

  it('calls onExitFocus on Escape', () => {
    const onExitFocus = vi.fn()
    render(<FocusInboxCard {...baseProps} onExitFocus={onExitFocus} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExitFocus).toHaveBeenCalled()
  })

  it('calls onSelectDetail on Enter', () => {
    const onSelectDetail = vi.fn()
    render(<FocusInboxCard {...baseProps} onSelectDetail={onSelectDetail} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSelectDetail).toHaveBeenCalledWith('a')
  })

  it('shows inbox-zero message when no tasks', () => {
    render(<FocusInboxCard {...baseProps} tasks={[]} />)
    expect(screen.getByText(/inbox zero/i)).toBeInTheDocument()
  })
})
