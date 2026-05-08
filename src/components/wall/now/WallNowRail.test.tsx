import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallNowRail } from './WallNowRail'

describe('WallNowRail', () => {
  it('renders dinner when provided', () => {
    render(<WallNowRail
      dinner="Lemony pasta"
      openListCount={4}
      discussionCount={2}
    />)
    expect(screen.getByText(/lemony pasta/i)).toBeInTheDocument()
  })

  it('renders list count', () => {
    render(<WallNowRail dinner={null} openListCount={4} discussionCount={0} />)
    expect(screen.getByText(/4/)).toBeInTheDocument()
  })

  it('renders discussion count when nonzero', () => {
    render(<WallNowRail dinner={null} openListCount={0} discussionCount={3} />)
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('omits discussion section when count is 0', () => {
    render(<WallNowRail dinner={null} openListCount={0} discussionCount={0} />)
    expect(screen.queryByText(/discuss/i)).not.toBeInTheDocument()
  })

  it('renders dinner placeholder when dinner is null', () => {
    render(<WallNowRail dinner={null} openListCount={0} discussionCount={0} />)
    expect(screen.getByText(/no dinner planned/i)).toBeInTheDocument()
  })
})
