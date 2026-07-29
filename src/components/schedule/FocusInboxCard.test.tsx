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

  describe('send to calendar', () => {
    it('hides the button when onSendToCalendar is not provided', () => {
      render(<FocusInboxCard {...baseProps} />)
      expect(screen.queryByRole('button', { name: /send to calendar/i })).not.toBeInTheDocument()
    })

    it('opens the day/time picker via the button and sends the current card', () => {
      const onSendToCalendar = vi.fn()
      render(<FocusInboxCard {...baseProps} onSendToCalendar={onSendToCalendar} />)

      fireEvent.click(screen.getByRole('button', { name: /send to calendar/i }))
      fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
      fireEvent.click(screen.getByRole('button', { name: '9am' }))

      expect(onSendToCalendar).toHaveBeenCalledWith('a', expect.any(Date), false, 60)
    })

    it('opens the picker with the "e" key and sends the current card', () => {
      const onSendToCalendar = vi.fn()
      render(<FocusInboxCard {...baseProps} onSendToCalendar={onSendToCalendar} />)

      expect(screen.queryByText('Schedule')).not.toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'e' })
      expect(screen.getByText('Schedule')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
      fireEvent.click(screen.getByRole('button', { name: '9am' }))

      expect(onSendToCalendar).toHaveBeenCalledWith('a', expect.any(Date), false, 60)
    })

    it('leaves "c" bound to complete', () => {
      const onComplete = vi.fn()
      const onSendToCalendar = vi.fn()
      render(<FocusInboxCard {...baseProps} onComplete={onComplete} onSendToCalendar={onSendToCalendar} />)

      fireEvent.keyDown(window, { key: 'c' })

      expect(onComplete).toHaveBeenCalledWith('a')
      expect(onSendToCalendar).not.toHaveBeenCalled()
    })

    it('suppresses other shortcuts while the picker is open, and Escape closes the picker instead of exiting focus mode', () => {
      const onComplete = vi.fn()
      const onExitFocus = vi.fn()
      render(
        <FocusInboxCard
          {...baseProps}
          onComplete={onComplete}
          onExitFocus={onExitFocus}
          onSendToCalendar={vi.fn()}
        />,
      )

      fireEvent.keyDown(window, { key: 'e' })
      expect(screen.getByText('Schedule')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'c' })
      expect(onComplete).not.toHaveBeenCalled()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onExitFocus).not.toHaveBeenCalled()
      expect(screen.queryByText('Schedule')).not.toBeInTheDocument()
    })

    it('disables the button while a send is in flight', () => {
      render(<FocusInboxCard {...baseProps} onSendToCalendar={vi.fn()} sending />)
      const button = screen.getByRole('button', { name: /send to calendar/i })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('does not open the picker via the "e" key while a send is in flight', () => {
      const onSendToCalendar = vi.fn()
      render(<FocusInboxCard {...baseProps} onSendToCalendar={onSendToCalendar} sending />)

      fireEvent.keyDown(window, { key: 'e' })

      expect(screen.queryByText('Schedule')).not.toBeInTheDocument()
      expect(onSendToCalendar).not.toHaveBeenCalled()
    })
  })
})
