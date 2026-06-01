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

  it('clicking a create row reveals an inline name input and does not create yet', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    expect(props.onCreateTask).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText(/name the task/i)).toBeInTheDocument()
  })

  it('prefills the inline input with the typed search text', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Groceries' } })
    fireEvent.click(screen.getByRole('button', { name: /create task "Groceries"/i }))
    expect(screen.getByPlaceholderText(/name the task/i)).toHaveValue('Groceries')
  })

  it('creates on Enter, links via onSelect with the new id, then closes', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    const input = screen.getByPlaceholderText(/name the task/i)
    fireEvent.change(input, { target: { value: 'Groceries' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(props.onCreateTask).toHaveBeenCalledWith('Groceries'))
    await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith('task', 'task-new'))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('does not create from an empty inline input', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    const input = screen.getByPlaceholderText(/name the task/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onCreateTask).not.toHaveBeenCalled()
  })

  it('keeps the picker open and does not link when create fails', async () => {
    const props = setup({ onCreateTask: vi.fn(async () => undefined) })
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    const input = screen.getByPlaceholderText(/name the task/i)
    fireEvent.change(input, { target: { value: 'Groceries' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(props.onCreateTask).toHaveBeenCalled())
    expect(props.onSelect).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('Escape cancels naming mode back to the create row', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.keyDown(screen.getByPlaceholderText(/name the task/i), { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/name the task/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument()
  })
})
