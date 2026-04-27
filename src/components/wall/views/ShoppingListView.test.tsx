import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ListItem } from '@/types/list'
import { ShoppingListView } from './ShoppingListView'

let mockState: {
  items: ListItem[]
  loading: boolean
  error: string | null
} = { items: [], loading: false, error: null }
const mockToggle = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/hooks/useShoppingList', () => ({
  useShoppingList: () => ({
    items: mockState.items,
    loading: mockState.loading,
    error: mockState.error,
    toggleComplete: mockToggle,
    refresh: mockRefresh,
  }),
}))

const sampleItems: ListItem[] = [
  { id: 'i1', listId: 'l1', text: 'milk', sortOrder: 0, completed: false,
    createdAt: new Date(), updatedAt: new Date() },
  { id: 'i2', listId: 'l1', text: 'bread', sortOrder: 1, completed: true,
    createdAt: new Date(), updatedAt: new Date() },
]

describe('ShoppingListView', () => {
  beforeEach(() => {
    mockState = { items: sampleItems, loading: false, error: null }
    mockToggle.mockReset()
    mockRefresh.mockReset()
  })

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

  it('renders the loading state', () => {
    mockState = { items: [], loading: true, error: null }
    render(<ShoppingListView appleListName="Groceries" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the error state with message', () => {
    mockState = { items: [], loading: false, error: 'list "Groceries" not found' }
    render(<ShoppingListView appleListName="Groceries" />)
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('renders empty-state hint when list is empty', () => {
    mockState = { items: [], loading: false, error: null }
    render(<ShoppingListView appleListName="Groceries" />)
    expect(screen.getByText(/list is empty/i)).toBeInTheDocument()
  })
})
