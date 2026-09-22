import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastLiveRegion } from './ToastLiveRegion'

describe('ToastLiveRegion', () => {
  it('stays mounted while empty, so a later toast is announced', () => {
    const { rerender } = render(<ToastLiveRegion message={null} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('')
    rerender(<ToastLiveRegion message="Moved to Friday" />)
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Moved to Friday')
  })

  it('announces errors assertively', () => {
    render(<ToastLiveRegion message="Couldn't save" urgent />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save")
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
