import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PanelSteps } from './PanelSteps'

describe('PanelSteps', () => {
  it('renders the steps in order under a Steps heading', () => {
    render(<PanelSteps steps={['Preheat oven to 400°F', 'Roast 20 minutes', 'Serve']} />)
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('Preheat oven to 400°F')).toBeInTheDocument()
    expect(screen.getByText('Serve')).toBeInTheDocument()
  })

  it('renders nothing when there are no steps', () => {
    const { container } = render(<PanelSteps steps={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when steps is undefined', () => {
    const { container } = render(<PanelSteps steps={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
