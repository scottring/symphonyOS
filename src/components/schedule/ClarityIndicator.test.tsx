import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ClarityIndicator } from './ClarityIndicator'

const baseProps = { tasks: [], projects: [], familyMembers: [], trigger: <span>Clarity Good</span> }

describe('ClarityIndicator', () => {
  it('renders the provided trigger and is collapsed by default', () => {
    render(<ClarityIndicator {...baseProps} />)
    expect(screen.getByText('Clarity Good')).toBeInTheDocument()
    expect(screen.queryByTestId('clarity-popover')).not.toBeInTheDocument()
  })
  it('opens the remediation popover on trigger click', async () => {
    const { user } = render(<ClarityIndicator {...baseProps} />)
    await user.click(screen.getByText('Clarity Good'))
    expect(screen.getByTestId('clarity-popover')).toBeInTheDocument()
  })
})
