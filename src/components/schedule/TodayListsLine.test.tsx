import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ListsContextValue } from '@/contexts/ListsContext'

const ctx = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/contexts/ListsContext', () => ({ useOptionalListsContext: () => ctx.value }))
vi.mock('@/hooks/useOpenListCounts', () => ({ useOpenListCounts: () => ({ counts: new Map([['g', 12], ['a', 3]]), refresh: vi.fn() }) }))
vi.mock('@/components/list/ListView', () => ({ ListView: ({ list }: { list: { title: string } }) => <div>List view: {list.title}</div> }))

import { TodayListsLine } from './TodayListsLine'

const list = (id: string, title: string, showOnToday: boolean) => ({ id, title, showOnToday, category: 'shopping', visibility: 'family', sortOrder: 0, createdAt: new Date(), updatedAt: new Date() })

describe("Today's Lists line (Scott, 2026-11-13)", () => {
  it('shows only the lists switched on, with their open counts', () => {
    ctx.value = { lists: [list('g', 'Groceries', true), list('m', 'Movies', false), list('a', 'Amazon', true)], selectedList: null, setSelectedListId: vi.fn(), listItems: [] } as unknown as ListsContextValue
    render(<TodayListsLine />)
    const nav = screen.getByRole('navigation', { name: 'Lists' })
    expect(nav).toHaveTextContent('Groceries12')
    expect(nav).toHaveTextContent('Amazon3')
    expect(nav).not.toHaveTextContent('Movies')
  })

  it('says nothing when no list is on Today, or outside the shell', () => {
    ctx.value = { lists: [list('m', 'Movies', false)], selectedList: null, setSelectedListId: vi.fn(), listItems: [] } as unknown as ListsContextValue
    const { container, rerender } = render(<TodayListsLine />)
    expect(container).toBeEmptyDOMElement()
    ctx.value = null
    rerender(<TodayListsLine />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens a list beside the page and selects it', async () => {
    const setSelectedListId = vi.fn()
    const g = list('g', 'Groceries', true)
    ctx.value = { lists: [g], selectedList: g, setSelectedListId, listItems: [] } as unknown as ListsContextValue
    render(<TodayListsLine />)
    fireEvent.click(screen.getByRole('button', { name: /Groceries/ }))
    expect(setSelectedListId).toHaveBeenLastCalledWith('g')
    expect(await screen.findByText('List view: Groceries')).toBeInTheDocument()
  })
})

describe('the list sheet (2026-11-13)', () => {
  it('puts what you still need first, then only the last ten ticked off', async () => {
    const g = list('g', 'Groceries', true)
    const items = [
      ...Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, listId: 'g', text: `done ${i}`, completed: true, completedAt: new Date(2026, 10, 1, i), sortOrder: i })),
      { id: 'o1', listId: 'g', text: 'Milk', completed: false, sortOrder: 99 },
    ]
    let seen: { id: string }[] = []
    vi.doMock('@/components/list/ListView', () => ({ ListView: ({ items: it }: { items: { id: string }[] }) => { seen = it; return <div>sheet</div> } }))
    ctx.value = { lists: [g], selectedList: g, setSelectedListId: vi.fn(), listItems: items } as unknown as ListsContextValue
    vi.resetModules()
    const { TodayListsLine: Fresh } = await import('./TodayListsLine')
    render(<Fresh />)
    fireEvent.click(screen.getByRole('button', { name: /Groceries/ }))
    await screen.findByText('sheet')
    expect(seen[0].id).toBe('o1')
    expect(seen).toHaveLength(11)
    expect(seen[1].id).toBe('d29')
  })
})
