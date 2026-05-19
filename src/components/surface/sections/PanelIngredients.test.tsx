import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelIngredients } from './PanelIngredients'

describe('PanelIngredients', () => {
  it('renders nothing when ingredients empty or undefined', () => {
    const a = render(<PanelIngredients ingredients={[]} />)
    expect(a.container.firstChild).toBeNull()
    const b = render(<PanelIngredients ingredients={undefined} />)
    expect(b.container.firstChild).toBeNull()
  })
  it('renders the INGREDIENTS eyebrow and each ingredient', () => {
    render(<PanelIngredients ingredients={['Pasta', 'Cannellini beans', 'Celery']} />)
    expect(screen.getByText(/ingredients/i)).toBeInTheDocument()
    expect(screen.getByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('Cannellini beans')).toBeInTheDocument()
    expect(screen.getByText('Celery')).toBeInTheDocument()
  })
  it('toggles a checkbox locally on click', async () => {
    const { user } = render(<PanelIngredients ingredients={['Pasta']} />)
    const cb = screen.getByRole('checkbox', { name: 'Pasta' })
    expect(cb).not.toBeChecked()
    await user.click(cb)
    expect(cb).toBeChecked()
  })
})
