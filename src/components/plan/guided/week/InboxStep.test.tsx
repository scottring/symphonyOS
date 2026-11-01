import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import type { DeckCard } from '@/lib/planning/deck'
import { InboxStep } from './InboxStep'

const card = (title: string): DeckCard => ({ key: title, task: createMockTask({ id: title, title, bucket: 'inbox' }), source: 'inbox', facts: 'Captured Monday' })
const actions = () => ({ keepThisWeek: vi.fn(async () => true), later: vi.fn(async () => true), letGo: vi.fn(async () => true) })
const row = (title: string) => within(screen.getByRole('listitem', { name: title }))

describe('InboxStep — step 4, clear the inbox', () => {
  it('each capture offers This week, Later and Let go', async () => {
    const a = actions()
    const cards = [card('Book the vet'), card('Gutter quote')]
    render(<InboxStep cards={cards} actions={a} />)
    for (const t of ['Book the vet', 'Gutter quote']) {
      expect(row(t).getAllByRole('button').map((b) => b.textContent)).toEqual(['This week', 'Later ▸', 'Let go'])
    }
    expect(row('Book the vet').getByText('Captured Monday')).toBeInTheDocument()
    await act(async () => { fireEvent.click(row('Book the vet').getByRole('button', { name: 'This week: Book the vet' })) })
    expect(a.keepThisWeek).toHaveBeenCalledWith(cards[0])
    await act(async () => { fireEvent.click(row('Gutter quote').getByRole('button', { name: 'Let go: Gutter quote' })) })
    expect(a.letGo).toHaveBeenCalledWith(cards[1])
  })

  it('Later opens when: next week, this month, next month', async () => {
    const a = actions()
    const cards = [card('Book the vet')]
    render(<InboxStep cards={cards} actions={a} />)
    fireEvent.click(screen.getByRole('button', { name: 'Later: Book the vet' }))
    const when = within(screen.getByRole('group', { name: 'Later: Book the vet' }))
    expect(when.getAllByRole('button').map((b) => b.textContent)).toEqual(['Next week', 'This month', 'Next month'])
    await act(async () => { fireEvent.click(when.getByRole('button', { name: 'Next month' })) })
    expect(a.later).toHaveBeenCalledWith(cards[0], 'next-month')
  })

  it('a write that did not save says so on its row', async () => {
    render(<InboxStep cards={[card('Book the vet')]} actions={{ ...actions(), letGo: vi.fn(async () => false) }} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Let go: Book the vet' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('while a capture saves, Later waits too', async () => {
    let finish!: (ok: boolean) => void
    render(<InboxStep cards={[card('Book the vet')]} actions={{ ...actions(), keepThisWeek: vi.fn(() => new Promise<boolean>((r) => { finish = r })) }} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'This week: Book the vet' })) })
    expect(screen.getByRole('button', { name: 'Later: Book the vet' })).toBeDisabled()
    await act(async () => { finish(true) })
  })

  it('an empty inbox reads "Inbox is clear."', () => {
    render(<InboxStep cards={[]} actions={actions()} />)
    expect(screen.getByText('Inbox is clear.')).toBeInTheDocument()
  })
})
