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
  it('shows the clarity score as a percentage in the popover', async () => {
    const { user } = render(<ClarityIndicator {...baseProps} />)
    await user.click(screen.getByText('Clarity Good'))
    // Empty task list scores a perfect 100; it must read as a percent.
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
  it('renders a built-in ring trigger when none is provided, and it opens the popover', async () => {
    // Built-in trigger only renders when there are tasks (guard: no tasks + no trigger → null).
    const task = { id: 't1', title: 'A', completed: false, bucket: 'inbox', createdAt: new Date() } as unknown as (typeof baseProps)['tasks'][number]
    const { trigger: _omit, ...rest } = baseProps
    const { user } = render(<ClarityIndicator {...rest} tasks={[task]} />)
    const builtIn = screen.getByText('Clarity')
    expect(builtIn).toBeInTheDocument()
    await user.click(builtIn)
    expect(screen.getByTestId('clarity-popover')).toBeInTheDocument()
  })
})
