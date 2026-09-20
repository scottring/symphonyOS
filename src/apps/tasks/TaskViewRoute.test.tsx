import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { TaskViewRoute } from './TaskViewRoute'

vi.mock('./TaskViewContainer', () => ({
  TaskViewContainer: ({ onBack }: { taskId: string; onBack: () => void }) => (
    <button type="button" onClick={onBack}>Back</button>
  ),
}))

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

const app = (
  <Routes>
    <Route path="/season" element={<><Where /><a href="/task/t1">open</a></>} />
    <Route path="/today" element={<Where />} />
    <Route path="/task/:taskId" element={<><Where /><TaskViewRoute /></>} />
  </Routes>
)

describe('TaskViewRoute back', () => {
  // A step opened from /season used to return to a legacy /tasks-new/today.
  it('returns to the page the task was opened from', () => {
    render(<MemoryRouter initialEntries={['/season', '/task/t1']} initialIndex={1}>{app}</MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/season')
  })

  it('goes to Today from a deep link with no history', () => {
    render(<MemoryRouter initialEntries={['/task/t1']}>{app}</MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/today')
  })
})
