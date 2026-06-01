import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EntityLinkPicker } from './EntityLinkPicker'
import { createMockTask, createMockProject, createMockContact } from '@/test/mocks/factories'

const tasks = [createMockTask({ id: 't1', title: 'Existing task' })]
const projects = [createMockProject({ id: 'p1', name: 'Existing project' })]
const contacts = [createMockContact({ id: 'c1', name: 'Existing contact' })]

function setup(overrides: Partial<React.ComponentProps<typeof EntityLinkPicker>> = {}) {
  const props = {
    tasks,
    projects,
    contacts,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onCreateTask: vi.fn(async () => 'task-new'),
    onCreateProject: vi.fn(async () => 'project-new'),
    onCreateContact: vi.fn(async () => 'contact-new'),
    ...overrides,
  }
  render(<EntityLinkPicker {...props} />)
  return props
}

describe('EntityLinkPicker inline create', () => {
  it('shows all three create rows on the All tab even with an empty search', () => {
    setup()
    expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new contact/i })).toBeInTheDocument()
  })

  it('shows only the matching create row on a type-specific tab', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /projects/i }))
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new contact/i })).not.toBeInTheDocument()
  })

  it('hides a create row when its create callback is not provided', () => {
    setup({ onCreateContact: undefined })
    expect(screen.queryByRole('button', { name: /new contact/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument()
  })

  it('labels the create row with the typed name', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Groceries' } })
    expect(screen.getByRole('button', { name: /create task "Groceries"/i })).toBeInTheDocument()
  })

  it('focuses the search box and does not create when the box is empty', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    expect(props.onCreateTask).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText(/search/i)).toHaveFocus()
  })

  it('creates, links via onSelect with the new id, then closes', async () => {
    const props = setup()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Groceries' } })
    fireEvent.click(screen.getByRole('button', { name: /create task "Groceries"/i }))
    await waitFor(() => expect(props.onCreateTask).toHaveBeenCalledWith('Groceries'))
    await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith('task', 'task-new'))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('keeps the picker open and does not link when create fails', async () => {
    const props = setup({ onCreateTask: vi.fn(async () => undefined) })
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Groceries' } })
    fireEvent.click(screen.getByRole('button', { name: /create task "Groceries"/i }))
    await waitFor(() => expect(props.onCreateTask).toHaveBeenCalled())
    expect(props.onSelect).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })
})
