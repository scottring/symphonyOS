import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MealPreferencesModal } from './MealPreferencesModal'

const { hookState, saveMock } = vi.hoisted(() => ({
  hookState: { content: '', loading: false, saving: false, error: null as string | null },
  saveMock: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/hooks/useMealPreferences', () => ({
  useMealPreferences: () => ({
    content: hookState.content,
    loading: hookState.loading,
    saving: hookState.saving,
    error: hookState.error,
    save: saveMock,
    reload: vi.fn(),
  }),
}))

describe('MealPreferencesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookState.content = 'veggie-heavy, family of four'
    hookState.loading = false
    hookState.saving = false
    hookState.error = null
    saveMock.mockResolvedValue(true)
  })

  it('renders nothing when closed', () => {
    const { container } = render(<MealPreferencesModal isOpen={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('seeds the textarea from the loaded master prompt', () => {
    render(<MealPreferencesModal isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('veggie-heavy, family of four')
  })

  it('Save persists the edited draft then closes', async () => {
    const onClose = vi.fn()
    render(<MealPreferencesModal isOpen onClose={onClose} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'now with more fish' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })

    expect(saveMock).toHaveBeenCalledWith('now with more fish')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancel closes without saving', () => {
    const onClose = vi.fn()
    render(<MealPreferencesModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(saveMock).not.toHaveBeenCalled()
  })
})
