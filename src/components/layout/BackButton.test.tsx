import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { BackButton, PhoneBack } from './BackButton'

function App({ root }: { root: boolean }) {
  return <BrowserRouter>
    <BackButton />
    <PhoneBack isRoot={root} />
    <Link to="/routines">Go to Routines</Link>
    <Routes><Route path="*" element={null} /></Routes>
  </BrowserRouter>
}

describe('Back (2026-10-24: "we could really use a global back button")', () => {
  it('is quiet where the visit began, then goes back inside Symphony', async () => {
    window.history.replaceState(null, '', '/today')
    render(<App root={false} />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('link', { name: 'Go to Routines' }))
    expect(window.location.pathname).toBe('/routines')
    expect(back).not.toHaveAttribute('aria-disabled')
    // The phone's Back line shows too, on a page that is not a tab root.
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(2)
    fireEvent.click(back)
    await waitFor(() => expect(window.location.pathname).toBe('/today'))
    expect(back).toHaveAttribute('aria-disabled', 'true')
  })

  it('has no phone Back line on a tab root', () => {
    window.history.replaceState(null, '', '/today')
    render(<App root />)
    fireEvent.click(screen.getByRole('link', { name: 'Go to Routines' }))
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1)
  })
})
