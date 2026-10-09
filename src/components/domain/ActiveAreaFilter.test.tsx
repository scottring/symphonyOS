import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DomainProvider, LAYERS_KEY } from '@/hooks/useDomain'
import { ActiveAreaFilter } from './ActiveAreaFilter'

const mount = () => render(<DomainProvider><ActiveAreaFilter /></DomainProvider>)

describe('ActiveAreaFilter', () => {
  beforeEach(() => localStorage.clear())

  it('explains a restored Personal-only filter and clears it persistently', () => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(['personal']))
    const view = mount()
    expect(screen.getByRole('status')).toHaveTextContent('Showing Personal only')
    expect(screen.getByText('Items from other areas are hidden by this filter.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Show all areas' }))
    expect(screen.queryByText('Showing Personal only')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY)!)).toEqual(['work', 'family', 'personal', 'unsorted'])
    view.unmount()
    mount()
    expect(screen.queryByRole('button', { name: 'Show all areas' })).not.toBeInTheDocument()
  })

  it.each([['work', 'family'], ['unsorted']])('names every selected area: %j', (...areas) => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(areas))
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(areas.length === 1 ? 'Showing Unsorted only' : 'Showing Work, Family only')
  })

  it('stays quiet when all areas are visible', () => {
    mount()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
