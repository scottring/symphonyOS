import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchoolFeedsPanel } from './SchoolFeedsCard'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (t: string) => `data:image/png;base64,${t}`) } }))

describe('SchoolFeedsPanel', () => {
  it('lists each feed and, when WhatsApp needs linking, draws the code to scan', async () => {
    render(<SchoolFeedsPanel status={{ lines: [{ label: 'WhatsApp', text: 'Needs linking', tone: 'bad' }], pairQr: '2@abc', needsLink: true }} />)
    expect(screen.getByText('Needs linking')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'WhatsApp pairing code' })).toHaveAttribute('src', 'data:image/png;base64,2@abc')
  })

  it('between codes, says one is on its way', () => {
    render(<SchoolFeedsPanel status={{ lines: [], pairQr: null, needsLink: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent(/new code appears/)
  })

  it('no linking box when nothing needs linking', () => {
    render(<SchoolFeedsPanel status={{ lines: [{ label: 'WhatsApp', text: 'Connected', tone: 'ok' }], pairQr: null, needsLink: false }} />)
    expect(screen.queryByRole('group', { name: 'Link WhatsApp' })).toBeNull()
  })
})
