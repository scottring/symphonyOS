import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ShoppingListView } from './ShoppingListView'

const mockToggle = vi.fn()
vi.mock('@/hooks/useShoppingList', () => ({
  useShoppingList: () => ({
    items: [
      { id: 'i1', listId: 'l1', text: 'milk', sortOrder: 0, completed: false,
        createdAt: new Date(), updatedAt: new Date() },
      { id: 'i2', listId: 'l1', text: 'bread', sortOrder: 1, completed: true,
        createdAt: new Date(), updatedAt: new Date() },
    ],
    loading: false,
    error: null,
    toggleComplete: mockToggle,
    refresh: vi.fn(),
  }),
}))

describe('ShoppingListView', () => {
  it('renders incomplete items prominently', () => {
    render(<ShoppingListView appleListName="Groceries" />)
    expect(screen.getByText('milk')).toBeInTheDocument()
  })

  it('shows completed items with strikethrough or muted styling', () => {
    render(<ShoppingListView appleListName="Groceries" />)
    const bread = screen.getByText('bread')
    expect(bread.closest('[data-completed="true"]')).toBeTruthy()
  })

  it('calls toggleComplete on tap', async () => {
    render(<ShoppingListView appleListName="Groceries" />)
    fireEvent.click(screen.getByText('milk'))
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith('i1', true))
  })
})
