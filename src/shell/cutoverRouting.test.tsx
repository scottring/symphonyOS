import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Shell } from './Shell'
import { createRegistry } from './appRegistry'
import type { AppDef } from './types'

// A stand-in for TasksApp: same descendant-<Routes> shape (segment-named
// child routes) without the heavy data hooks. The routing behaviour we care
// about is identical.
function TasksAppStub() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/today" replace />} />
      <Route path="today" element={<div data-testid="today-content">TODAY_CONTENT</div>} />
      <Route path="inbox" element={<div data-testid="inbox-content">INBOX_CONTENT</div>} />
      <Route path="task/:taskId" element={<div data-testid="task-content">TASK_CONTENT</div>} />
    </Routes>
  )
}

const tasksStub: AppDef = {
  id: 'tasks',
  route: '/',
  index: true,
  Component: TasksAppStub,
}
const registry = createRegistry([tasksStub])
const StubLayout = ({ children }: { children: ReactNode }) => <div data-testid="chrome">{children}</div>

describe('Shell cutover routing', () => {
  it('REPRO: mounting Shell at an exact (non-splat) /today renders blank', () => {
    // Mirrors the pre-fix main.tsx: <Route path="/today" element={<Shell/>} />.
    render(
      <MemoryRouter initialEntries={['/today']}>
        <Routes>
          <Route path="/today" element={<Shell registry={registry} Layout={StubLayout} />} />
        </Routes>
      </MemoryRouter>,
    )
    // Chrome renders, but TasksApp's `today` segment route never matches → blank.
    expect(screen.getByTestId('chrome')).toBeTruthy()
    expect(screen.queryByTestId('today-content')).toBeNull()
  })

  it('FIX: a root /* catch-all (after explicit legacy routes) renders Today', () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <Routes>
          <Route path="/goals" element={<div data-testid="legacy-goals">LEGACY_GOALS</div>} />
          <Route path="/*" element={<Shell registry={registry} Layout={StubLayout} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('today-content')).toBeTruthy()
  })

  it('FIX: index path / redirects through to Today', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/*" element={<Shell registry={registry} Layout={StubLayout} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('today-content')).toBeTruthy()
  })

  it('FIX: /inbox and /task/:id segments still resolve under the catch-all', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/inbox']}>
        <Routes>
          <Route path="/*" element={<Shell registry={registry} Layout={StubLayout} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('inbox-content')).toBeTruthy()
    unmount()

    render(
      <MemoryRouter initialEntries={['/task/abc123']}>
        <Routes>
          <Route path="/*" element={<Shell registry={registry} Layout={StubLayout} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('task-content')).toBeTruthy()
  })

  it('FIX: an explicit legacy route still wins over the catch-all', () => {
    render(
      <MemoryRouter initialEntries={['/goals']}>
        <Routes>
          <Route path="/goals" element={<div data-testid="legacy-goals">LEGACY_GOALS</div>} />
          <Route path="/*" element={<Shell registry={registry} Layout={StubLayout} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('legacy-goals')).toBeTruthy()
    expect(screen.queryByTestId('today-content')).toBeNull()
  })
})
