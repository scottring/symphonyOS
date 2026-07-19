import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SendToGroceriesModalV2 } from './SendToGroceriesModalV2'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'

const insertMock = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })) },
  },
}))

const ci = (text: string, category: ConsolidatedIngredient['category']): ConsolidatedIngredient =>
  ({ text, category, fromRecipeIds: ['r1'] })

const consolidated: ConsolidatedIngredient[] = [
  ci('2 lb chicken breast', 'Meat'),
  ci('8 eggs', 'Dairy'),
  ci('2 tbsp olive oil', 'Pantry'), // staple
  ci('salt', 'Spices'),             // staple
]

function open() {
  return render(
    <SendToGroceriesModalV2
      isOpen
      onClose={vi.fn()}
      consolidated={consolidated}
      groceriesListId="list-1"
      currentItemTexts={[]}
      onSent={vi.fn()}
    />,
  )
}

describe('SendToGroceriesModalV2 — staples', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('puts staples under "check before buying", not the default list', () => {
    open()
    // The staples section is collapsed by default (tucked away); expand it.
    fireEvent.click(screen.getByRole('button', { name: /STAPLES — CHECK BEFORE BUYING/i }))
    // It shows olive oil + salt with Add buttons.
    expect(screen.getAllByRole('button', { name: /Add .* to the list/i })).toHaveLength(2)
  })

  it('sends only non-staple items by default', async () => {
    open()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send to Apple Reminders/i })) })
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1))
    const rows = insertMock.mock.calls[0][0] as Array<{ text: string }>
    const texts = rows.map(r => r.text)
    expect(texts).toContain('2 lb chicken breast')
    expect(texts).toContain('8 eggs')
    expect(texts).not.toContain('2 tbsp olive oil')
    expect(texts).not.toContain('salt')
  })

  it('adding a staple includes it in the send', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /STAPLES — CHECK BEFORE BUYING/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add 2 tbsp olive oil to the list/i }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send to Apple Reminders/i })) })
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1))
    const texts = (insertMock.mock.calls[0][0] as Array<{ text: string }>).map(r => r.text)
    expect(texts).toContain('2 tbsp olive oil')
    expect(texts).not.toContain('salt')
  })
})
