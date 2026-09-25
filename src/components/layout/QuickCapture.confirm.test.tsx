// S3-12: one capture, one confirmation. The shell confirms after its write;
// this component's own toast, shown before it, was the second.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { QuickCapture } from './QuickCapture'

const toastSpy = vi.fn()
vi.mock('@/hooks/useToast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showToast: (...args: unknown[]) => toastSpy(...args),
}))

describe('QuickCapture confirmation', () => {
  beforeEach(() => toastSpy.mockClear())

  const capture = async (props: { confirmsAfterWrite?: boolean }) => {
    const onAdd = vi.fn()
    const { user } = render(<QuickCapture onAdd={onAdd} isOpen showFab={false} {...props} />)
    await user.type(screen.getByRole('textbox'), 'Buy stamps')
    await user.click(screen.getByRole('button', { name: /Add to My Inbox/i }))
    expect(onAdd).toHaveBeenCalledWith('Buy stamps')
  }

  it('confirms by itself when the host does not', async () => {
    await capture({})
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/Added to Inbox/), 'success', 5000, expect.objectContaining({ label: 'Go to inbox' }))
  })

  it('stays quiet when the host confirms after its write', async () => {
    await capture({ confirmsAfterWrite: true })
    expect(toastSpy).not.toHaveBeenCalled()
  })
})
