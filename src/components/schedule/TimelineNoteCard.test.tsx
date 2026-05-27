import { it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { TimelineNoteCard } from './TimelineNoteCard'

it('renders note title and time label; is not a button and has no click-to-open', () => {
  render(<TimelineNoteCard title="Sprinklers" timeLabel="6:15" />)
  expect(screen.getByText('Sprinklers')).toBeInTheDocument()
  expect(screen.getByText('6:15')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})
