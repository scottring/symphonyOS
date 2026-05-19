import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { TodaysFocusCard } from './TodaysFocusCard'

describe('TodaysFocusCard', () => {
  it('renders the headline and a counts sub-line', () => {
    render(<TodaysFocusCard headline="Keep today simple and connected." priorities={2} meals={1} events={3} />)
    expect(screen.getByText('Keep today simple and connected.')).toBeInTheDocument()
    expect(screen.getByText('2 priorities • 1 meal • 3 events')).toBeInTheDocument()
  })
  it('uses singular nouns for counts of 1 and omits zero segments', () => {
    render(<TodaysFocusCard headline="x" priorities={1} meals={0} events={1} />)
    expect(screen.getByText('1 priority • 1 event')).toBeInTheDocument()
  })
  it('shows a gentle fallback when everything is zero', () => {
    render(<TodaysFocusCard headline="x" priorities={0} meals={0} events={0} />)
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument()
  })
})
