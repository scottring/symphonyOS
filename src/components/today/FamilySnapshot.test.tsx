import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { FamilySnapshot } from './FamilySnapshot'
import type { FamilyMemberSummary } from '@/lib/familySnapshot'

const onSelectMember = vi.fn()
const onViewAll = vi.fn()

const SAMPLE: FamilyMemberSummary[] = [
  { id: 'a', name: 'Iris', initials: 'IR', color: 'purple', roleLabel: 'parent', openTaskCount: 3 },
  { id: 'b', name: 'Kaleb', initials: 'K', color: 'blue', roleLabel: 'child', openTaskCount: 0 },
]

describe('FamilySnapshot', () => {
  it('renders nothing when there are no members', () => {
    const { container } = render(
      <FamilySnapshot members={[]} onSelectMember={onSelectMember} onViewAll={onViewAll} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders each member with name and initials', () => {
    render(<FamilySnapshot members={SAMPLE} onSelectMember={onSelectMember} onViewAll={onViewAll} />)
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('Kaleb')).toBeInTheDocument()
    expect(screen.getByText('IR')).toBeInTheDocument()
  })

  it('shows open-task count when > 0, omits the count when 0', () => {
    render(<FamilySnapshot members={SAMPLE} onSelectMember={onSelectMember} onViewAll={onViewAll} />)
    expect(screen.getByText(/3 open/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 open/i)).not.toBeInTheDocument()
  })

  it('calls onSelectMember when a row is clicked', async () => {
    const { user } = render(
      <FamilySnapshot members={SAMPLE} onSelectMember={onSelectMember} onViewAll={onViewAll} />,
    )
    await user.click(screen.getByRole('button', { name: /iris/i }))
    expect(onSelectMember).toHaveBeenCalledWith('a')
  })

  it('calls onViewAll when See all is clicked', async () => {
    const { user } = render(
      <FamilySnapshot members={SAMPLE} onSelectMember={onSelectMember} onViewAll={onViewAll} />,
    )
    await user.click(screen.getByRole('button', { name: /see all/i }))
    expect(onViewAll).toHaveBeenCalledTimes(1)
  })
})
