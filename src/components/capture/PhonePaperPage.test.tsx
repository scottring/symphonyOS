import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const upload = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: vi.fn(() => ({ upload })) } },
  getAuthUser: vi.fn(),
}))
vi.mock('@/lib/toJpeg', () => ({ toJpeg: vi.fn(async (b: Blob) => b) }))

import { PhonePaperPage } from './PhonePaperPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/paper/phone/abc']}>
      <Routes>
        <Route path="/paper/phone/:id" element={<PhonePaperPage user={{ id: 'u1' }} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { upload.mockReset() })

describe('PhonePaperPage', () => {
  it('opens the phone camera directly and uploads the shot where the desktop listens', async () => {
    upload.mockResolvedValue({ error: null })
    renderPage()
    const input = screen.getByLabelText(/take a photo of the page/i) as HTMLInputElement
    expect(input.getAttribute('capture')).toBe('environment')
    expect(input.getAttribute('accept')).toBe('image/*')

    await userEvent.upload(input, new File(['x'], 'page.jpg', { type: 'image/jpeg' }))

    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(upload.mock.calls[0][0]).toBe('u1/page/handoff-abc.jpg')
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/jpeg', upsert: true })
    expect(await screen.findByText(/sent to your desktop/i)).toBeInTheDocument()
  })

  it('shows the upload error and lets the user try again', async () => {
    upload.mockResolvedValue({ error: { message: 'bucket offline' } })
    renderPage()
    await userEvent.upload(screen.getByLabelText(/take a photo of the page/i), new File(['x'], 'p.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('bucket offline')
    expect(screen.getByRole('button', { name: /take photo/i })).toBeEnabled()
  })
})
