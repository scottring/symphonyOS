import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { SchoolDigest } from '@/lib/schoolDigest/schoolDigests'

const hook = vi.hoisted(() => ({ value: { digests: [] as SchoolDigest[], loading: false, failed: false, refresh: vi.fn() } }))
vi.mock('@/hooks/useSchoolDigests', () => ({ useSchoolDigests: () => hook.value }))

import { SchoolDigestApp } from './SchoolDigestApp'

const LONG = 'Study for Unit 4 math test (multiplying by 0, 1, 2, 5, 10)'
const digest = (id: string, date: string, label: string, title: string): SchoolDigest => ({
  id, date, label, toDoCount: 1, createdAt: new Date(`${date}T21:00:00Z`),
  sections: [{ source: '3-01 Mr. Gorby', toDo: [{ title, when: 'Thu', details: 'The Unit 4 Review can help.' }], goodToKnow: ['Early dismissal Friday.'], chatter: 'Nothing else.' }],
})

const renderPage = (path = '/school-digest') => render(<MemoryRouter initialEntries={[path]}><SchoolDigestApp /></MemoryRouter>)

describe('SchoolDigestApp', () => {
  beforeEach(() => { hook.value = { digests: [], loading: false, failed: false, refresh: vi.fn() } })

  it('opens the newest digest with every word of it', () => {
    hook.value.digests = [digest('b', '2026-11-03', 'Tue, Nov 3', LONG), digest('a', '2026-10-30', 'Fri, Oct 30', 'Return picture form')]
    renderPage()
    expect(screen.getByText(LONG)).toBeInTheDocument()
    expect(screen.getByText('The Unit 4 Review can help.')).toBeInTheDocument()
    expect(screen.getByText('Early dismissal Friday.')).toBeInTheDocument()
    // "Nothing else." is the model's empty chatter, not news.
    expect(screen.queryByText('Nothing else.')).not.toBeInTheDocument()
  })

  it('switches to an earlier day', () => {
    hook.value.digests = [digest('b', '2026-11-03', 'Tue, Nov 3', LONG), digest('a', '2026-10-30', 'Fri, Oct 30', 'Return picture form')]
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Fri, Oct 30/ }))
    expect(screen.getByText('Return picture form')).toBeInTheDocument()
    expect(screen.queryByText(LONG)).not.toBeInTheDocument()
  })

  it('opens the day a link names', () => {
    hook.value.digests = [digest('b', '2026-11-03', 'Tue, Nov 3', LONG), digest('a', '2026-10-30', 'Fri, Oct 30', 'Return picture form')]
    renderPage('/school-digest?date=2026-10-30')
    expect(screen.getByText('Return picture form')).toBeInTheDocument()
  })

  it('says none are kept yet rather than showing an empty page', () => {
    renderPage()
    expect(screen.getByText('No digests kept yet.')).toBeInTheDocument()
  })

  it('a failed read is not an empty list', () => {
    hook.value.failed = true
    renderPage()
    expect(screen.getByText('The school digest didn’t load.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(hook.value.refresh).toHaveBeenCalled()
  })
})
