import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapContextPanel } from './TapContextPanel'
import { createMockTask, createMockContact, createMockProject } from '@/test/mocks/factories'

describe('TapContextPanel', () => {
  const baseHandlers = {
    onClose: vi.fn(),
    onTitleChange: vi.fn(),
    onNotesChange: vi.fn(),
    onToggleComplete: vi.fn(),
    onSchedule: vi.fn(),
    isPinned: false,
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
    onOpenContact: vi.fn(),
    onOpenMember: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenEvent: vi.fn(),
    onOpenTask: vi.fn(),
    onOpenRelated: vi.fn(),
    onToggleSubtask: vi.fn(),
    onAddSubtask: vi.fn(),
    onAddLink: vi.fn(),
    onContextChange: vi.fn(),
    onAssigneesChange: vi.fn(),
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders task title in the header', () => {
    const task = createMockTask({ title: 'Call Dr. Smith' })
    render(<TapContextPanel
      task={task}
      contacts={[]}
      projects={[]}
      events={[]}
      familyMembers={[]}
      siblingTaskCandidates={[]}
      allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Call Dr. Smith')).toBeInTheDocument()
  })

  it('renders contact when linked', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    const task = createMockTask({ contactId: 'c1' })
    render(<TapContextPanel
      task={task}
      contacts={[contact]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument()
    expect(screen.getAllByText(/555-0107/).length).toBeGreaterThan(0)
  })

  it('renders project when linked', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam — Health' })
    const task = createMockTask({ projectId: 'p1' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[project]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Liam — Health')).toBeInTheDocument()
  })

  it('renders Might be relevant items', () => {
    const target = createMockTask({ id: 't1', contactId: 'c1', title: 'Call Dr. Smith' })
    const sib = createMockTask({ id: 't2', contactId: 'c1', title: 'Last call to Dr. Smith' })
    render(<TapContextPanel
      task={target}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]}
      allTasks={[target, sib]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Last call to Dr. Smith')).toBeInTheDocument()
  })

  it('does not render empty People/Linked/Might-be-relevant sections for a sparse task', () => {
    const task = createMockTask({ title: 'lonely' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.queryByText(/^People$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Linked$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Might be relevant$/i)).not.toBeInTheDocument()
  })

  it('renders subtasks when present', () => {
    const sub = createMockTask({ id: 's1', title: 'Sub one', parentTaskId: 't1' })
    const task = createMockTask({ id: 't1', title: 'Parent', subtasks: [sub] })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText('Sub one')).toBeInTheDocument()
  })

  it('lets you change the task context', () => {
    const onContextChange = vi.fn()
    const task = createMockTask({ context: 'work' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
      onContextChange={onContextChange}
      onAssigneesChange={vi.fn()}
    />)
    // Open the ContextPicker trigger, then click the 'Personal' option
    fireEvent.click(screen.getByRole('button', { name: /set context/i }))
    fireEvent.click(screen.getByRole('button', { name: /personal/i }))
    expect(onContextChange).toHaveBeenCalledWith('personal')
  })
})
