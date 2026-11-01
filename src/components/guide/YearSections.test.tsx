import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { YearVisionSection } from './YearVisionSection'
import { YearLandscapeSection } from './YearLandscapeSection'

const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('YearVisionSection', () => {
  it('renders nothing until something is written', () => {
    const { container } = at(<YearVisionSection yearWord="2027" editTo="/year?plan=1&step=vision" />)
    expect(container).toBeEmptyDOMElement()
    const blank = at(<YearVisionSection value={{ tenYears: '  ', success: '' }} yearWord="2027" editTo="/x" />)
    expect(blank.container).toBeEmptyDOMElement()
  })

  it('shows the saved answers read-only, with an Edit link that opens the Vision step', () => {
    at(<YearVisionSection value={{ tenYears: 'Slow mornings by the lake.' }} yearWord="2027" editTo="/year?plan=1&step=vision" />)
    expect(screen.getByText('Slow mornings by the lake.')).toBeInTheDocument()
    expect(screen.queryByText(/success/)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/year?plan=1&step=vision')
  })

  it('names the year in the success question; no Edit where the year cannot be planned', () => {
    at(<YearVisionSection value={{ success: 'Moved house.' }} yearWord="2027" />)
    expect(screen.getByText('What would make 2027 a success')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('YearLandscapeSection', () => {
  it('renders nothing until a month has an entry', () => {
    const { container } = at(<YearLandscapeSection value={[]} editTo="/x" />)
    expect(container).toBeEmptyDOMElement()
    expect(at(<YearLandscapeSection editTo="/x" />).container).toBeEmptyDOMElement()
  })

  it('shows all 12 months read-only, marks a crowded one, and Edit opens the Landscape step', () => {
    at(<YearLandscapeSection value={[{ month: 3, text: 'Spring break\nDentist\nTaxes' }, { month: 7, text: 'Lake trip' }]} editTo="/year?plan=1&step=landscape" />)
    const months = within(screen.getByRole('list', { name: 'The 12 months' })).getAllByRole('listitem', { name: /^[A-Z][a-z]+$/ })
    expect(months).toHaveLength(12)
    const march = screen.getByRole('listitem', { name: 'March' })
    expect(within(march).getByText('Crowded')).toBeInTheDocument()
    expect(within(march).getByText('Spring break')).toBeInTheDocument()
    const july = screen.getByRole('listitem', { name: 'July' })
    expect(within(july).queryByText('Crowded')).toBeNull()
    expect(screen.getAllByText('Crowded')).toHaveLength(1)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/year?plan=1&step=landscape')
  })
})
