import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelMoreMenu } from './PanelMoreMenu'

describe('PanelMoreMenu', () => {
  const baseProps = {
    isPinned: false,
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
  }

  it('opens menu on trigger click', async () => {
    const { user } = render(<PanelMoreMenu {...baseProps} />)
    await user.click(screen.getByLabelText('More actions'))
    expect(screen.getByText(/^pin$/i)).toBeInTheDocument()
    expect(screen.getByText(/^delete$/i)).toBeInTheDocument()
  })

  it('shows "Unpin" when isPinned is true', async () => {
    const { user } = render(<PanelMoreMenu {...baseProps} isPinned />)
    await user.click(screen.getByLabelText('More actions'))
    expect(screen.getByText(/unpin/i)).toBeInTheDocument()
  })

  it('calls onTogglePin and closes when Pin is clicked', async () => {
    const onTogglePin = vi.fn()
    const { user } = render(<PanelMoreMenu {...baseProps} onTogglePin={onTogglePin} />)
    await user.click(screen.getByLabelText('More actions'))
    await user.click(screen.getByText(/^pin$/i))
    expect(onTogglePin).toHaveBeenCalledOnce()
    expect(screen.queryByText(/^pin$/i)).not.toBeInTheDocument()
  })

  it('asks for confirmation before delete', async () => {
    const onDelete = vi.fn()
    const { user } = render(<PanelMoreMenu {...baseProps} onDelete={onDelete} />)
    await user.click(screen.getByLabelText('More actions'))
    await user.click(screen.getByText(/^delete$/i))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/confirm/i)).toBeInTheDocument()
    await user.click(screen.getByText(/confirm/i))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  describe('group wrapper mode', () => {
    const groupProps = {
      ...baseProps,
      onUngroup: vi.fn(),
      onDeleteGroup: vi.fn(),
    }

    it('shows Ungroup + Delete group, and hides the plain Delete', async () => {
      const { user } = render(<PanelMoreMenu {...groupProps} />)
      await user.click(screen.getByLabelText('More actions'))
      expect(screen.getByText(/ungroup/i)).toBeInTheDocument()
      expect(screen.getByText(/delete group/i)).toBeInTheDocument()
      // The plain single-task "Delete" must NOT appear (it would orphan children)
      expect(screen.queryByText(/^delete$/i)).not.toBeInTheDocument()
    })

    it('ungroups immediately (no confirm), keeping tasks', async () => {
      const onUngroup = vi.fn()
      const { user } = render(<PanelMoreMenu {...groupProps} onUngroup={onUngroup} />)
      await user.click(screen.getByLabelText('More actions'))
      await user.click(screen.getByText(/ungroup/i))
      expect(onUngroup).toHaveBeenCalledOnce()
    })

    it('confirms before deleting the whole group', async () => {
      const onDeleteGroup = vi.fn()
      const { user } = render(<PanelMoreMenu {...groupProps} onDeleteGroup={onDeleteGroup} />)
      await user.click(screen.getByLabelText('More actions'))
      await user.click(screen.getByText(/delete group/i))
      expect(onDeleteGroup).not.toHaveBeenCalled()
      await user.click(screen.getByText(/delete group/i))
      expect(onDeleteGroup).toHaveBeenCalledOnce()
    })
  })
})
