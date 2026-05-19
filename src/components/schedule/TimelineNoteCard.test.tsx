import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineNoteCard } from './TimelineNoteCard'

it('renders note title, no checkbox, opens on click', () => {
  const onOpen = vi.fn()
  render(<TimelineNoteCard title="Sprinklers" timeLabel="6:15" onOpen={onOpen} />)
  expect(screen.getByText('Sprinklers')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Sprinklers'))
  expect(onOpen).toHaveBeenCalled()
})
