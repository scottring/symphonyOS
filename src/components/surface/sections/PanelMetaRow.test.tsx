import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelMetaRow } from './PanelMetaRow'

describe('PanelMetaRow', () => {
  it('renders bucket label', () => {
    render(<PanelMetaRow bucket="inbox" />)
    expect(screen.getByText(/inbox/i)).toBeInTheDocument()
  })

  it('renders for-whom when assigneeName provided', () => {
    render(<PanelMetaRow bucket="inbox" assigneeName="Liam" />)
    expect(screen.getByText(/for liam/i)).toBeInTheDocument()
  })

  it('renders creator when createdByName provided', () => {
    render(<PanelMetaRow bucket="inbox" createdByName="Iris" />)
    expect(screen.getByText(/created by iris/i)).toBeInTheDocument()
  })

  it('renders domain chip when domain provided', () => {
    render(<PanelMetaRow bucket="inbox" domain="family" />)
    expect(screen.getByText(/family/i)).toBeInTheDocument()
  })

  it('does not render domain chip when domain is undefined', () => {
    render(<PanelMetaRow bucket="inbox" />)
    expect(screen.queryByTestId('domain-chip')).not.toBeInTheDocument()
  })
})
