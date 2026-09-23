import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DailyEditionPreview, useEditionPreview } from './DailyEditionPreview'

function Host() {
  const [on, hide] = useEditionPreview()
  return on ? <DailyEditionPreview onHide={hide} /> : <p>off</p>
}
const at = (url: string) => render(<MemoryRouter initialEntries={[url]}><Host /></MemoryRouter>)

afterEach(() => { cleanup(); localStorage.clear() })

describe('the daily edition review preview', () => {
  it('is off unless asked for', () => {
    at('/today')
    expect(screen.getByText('off')).toBeInTheDocument()
  })

  it('says plainly that it is sample text, not about the household', () => {
    at('/today?edition=sample')
    expect(screen.getByRole('heading', { name: 'The daily edition' })).toBeInTheDocument()
    expect(screen.getByText(/Sample · design preview/)).toBeInTheDocument()
    expect(screen.getByText(/not about your household/)).toBeInTheDocument()
  })

  it('stays hidden once hidden, even though it was asked for in the URL', () => {
    at('/today?edition=sample')
    fireEvent.click(screen.getByRole('button', { name: 'Hide preview' }))
    expect(screen.getByText('off')).toBeInTheDocument()
    expect(localStorage.getItem('symphony-edition-preview')).toBeNull()
  })
})
