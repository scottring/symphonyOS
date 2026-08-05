import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelSection } from './PanelSection'

describe('PanelSection', () => {
  beforeEach(() => localStorage.clear())

  it('renders label and children when expanded', () => {
    render(<PanelSection id="notes" label="Notes"><p>body text</p></PanelSection>)
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('body text')).toBeInTheDocument()
  })

  it('hides children and shows the preview when collapsed', async () => {
    const user = userEvent.setup()
    render(
      <PanelSection id="notes" label="Notes" preview="Ask about the 3pm slot">
        <p>body text</p>
      </PanelSection>,
    )
    await user.click(screen.getByRole('button', { name: /collapse notes/i }))

    expect(screen.queryByText('body text')).not.toBeInTheDocument()
    expect(screen.getByText('Ask about the 3pm slot')).toBeInTheDocument()
  })

  it('reopens on a second click', async () => {
    const user = userEvent.setup()
    render(<PanelSection id="notes" label="Notes"><p>body text</p></PanelSection>)
    await user.click(screen.getByRole('button', { name: /collapse notes/i }))
    await user.click(screen.getByRole('button', { name: /expand notes/i }))
    expect(screen.getByText('body text')).toBeInTheDocument()
  })

  it('renders no preview element when none is given', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PanelSection id="links" label="Links"><p>body</p></PanelSection>,
    )
    await user.click(screen.getByRole('button', { name: /collapse links/i }))
    expect(container.querySelector('[data-panel-preview]')).toBeNull()
  })

  it('renders trailing actions and they do not toggle the section', async () => {
    const user = userEvent.setup()
    render(
      <PanelSection id="notes" label="Notes" actions={<button>Widen</button>}>
        <p>body text</p>
      </PanelSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Widen' }))
    expect(screen.getByText('body text')).toBeInTheDocument()
  })
})
