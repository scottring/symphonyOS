import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DigestStage } from './DigestStage'
import type { SchoolDigest } from '@/lib/schoolDigest/schoolDigests'

const digest: SchoolDigest = {
  id: 'd', date: '2026-11-06', label: 'Fri, Nov 6', toDoCount: 5, createdAt: new Date(2026, 10, 6),
  sections: [{ source: 'PTO', toDo: ['One', 'Two', 'Three', 'Four', 'Five'].map((title) => ({ title })), goodToKnow: ['Six'], chatter: '' }],
}

describe('the School digest on the wall: pages, not scrolling', () => {
  it('four cards to a page, with Previous and Next', () => {
    render(<DigestStage digests={[digest]} todayYmd="2026-11-10" />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['One', 'Two', 'Three', 'Four'])
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Five', 'Six'])
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('one page needs no pager', () => {
    render(<DigestStage digests={[{ ...digest, sections: [{ ...digest.sections[0], toDo: [{ title: 'Only' }], goodToKnow: [] }] }]} todayYmd="2026-11-10" />)
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull()
  })
})
