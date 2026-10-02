import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/components/capture/PageFromPaperFlow', () => ({
  PageFromPaperFlow: () => <div role="dialog" aria-label="Review page items" />,
}))

import { FromPaper } from './FromPaper'

// 2026-10-02: on Month, "Add from paper" sits in the list column's sticky
// heading (z-index 2). Its review sheet, mounted there, painted under the
// scenery and the reference column's heading; its buttons were out of reach.
describe('FromPaper', () => {
  it('opens its flow at the body, outside the column it sits in', () => {
    const { container } = render(
      <div className="pv2-colh" style={{ position: 'sticky', zIndex: 2 }}>
        <FromPaper altitude="month" periodStart={new Date(2026, 9, 1)} tasks={[]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Add from paper/ }))
    const sheet = screen.getByRole('dialog', { name: 'Review page items' })
    expect(container.contains(sheet)).toBe(false)
    expect(sheet.parentElement).toBe(document.body)
  })
})
