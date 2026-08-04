import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('falls back to the project phone number when task and contact have none', () => {
    const project = createMockProject({ id: 'p1', name: 'Kitchen renovation', phoneNumber: '555-8890' })
    const task = createMockTask({ projectId: 'p1' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[project]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    const tel = document.querySelector('a[href="tel:555-8890"]')
    expect(tel).not.toBeNull()
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

  it('lays sections out in a single column with hairline dividers and safe-top padding', () => {
    const task = createMockTask({ id: 'task-1', title: 'Test Task' })
    const { container } = render(
      <TapContextPanel
        task={task}
        contacts={[]}
        projects={[]}
        events={[]}
        familyMembers={[]}
        siblingTaskCandidates={[]}
        allTasks={[task]}
        {...baseHandlers}
        onAddLink={vi.fn()}
        onUpdateLocation={vi.fn()}
        onClearLocation={vi.fn()}
        onContextChange={vi.fn()}
        onAssigneesChange={vi.fn()}
        onAddSubtask={vi.fn()}
        onToggleSubtask={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenRelated={vi.fn()}
      />,
    )
    const article = container.querySelector('article')
    expect(article).not.toBeNull()
    // Check for divide-y hairline dividers between sections
    expect(article!.className).toMatch(/divide-y/)
    expect(article!.className).toMatch(/divide-neutral-200/)
    // Mobile padding tighter than desktop
    expect(article!.className).toMatch(/px-4/)
    // Py-4 rhythm applied to direct children
    expect(article!.className).toMatch(/\[&>\*\]:py-4/)
    // First child has collapsed top padding, last child has collapsed bottom padding
    expect(article!.className).toMatch(/\[&>\*:first-child\]:pt-0/)
    expect(article!.className).toMatch(/\[&>\*:last-child\]:pb-0/)
  })

  // ── Empty fields collapse into one Add row ────────────────────────────────
  //
  // The panel used to render Location, Notes, Photos & files, Subtasks and
  // Links as full titled sections with empty inputs on every task — six
  // headers asking for data before the panel told you anything.

  it('collapses a sparse task\'s empty fields into the Add row instead of six empty sections', () => {
    const task = createMockTask({ title: 'bare' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    // Assert on the empty INPUTS, which were the actual complaint — the Add
    // chips legitimately carry the same words as the section headers.
    expect(screen.queryByPlaceholderText(/add a location/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/add notes/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/paste a url/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Photos & files$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/add a subtask/i)).not.toBeInTheDocument()

    // Every one of them is still one tap away.
    expect(screen.getByRole('button', { name: 'Location' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subtask' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
  })

  it('reveals a field when its Add chip is clicked, and drops the chip', async () => {
    const user = userEvent.setup()
    const task = createMockTask({ title: 'bare' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect(screen.getByText(/add notes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
  })

  it('shows a field as a real section, and no chip, when it already has content', () => {
    const task = createMockTask({ title: 'has notes', notes: 'measurements are 30x40' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByText(/measurements are 30x40/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
  })

  // ── Phone and email: how to reach whoever the task requires ───────────────

  it('offers Phone and Email chips on a task that has neither', () => {
    const task = createMockTask({ title: 'bare' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByRole('button', { name: 'Phone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument()
  })

  it('shows a stored number in the Phone section without a second call link', () => {
    const task = createMockTask({ title: 'Call the school', phoneNumber: '(413) 555-0142' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    // The action bar owns the call button; the Phone section is the editor, so
    // the number appears there as text rather than as a second tel: link.
    expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(1)
    expect(screen.getAllByText('(413) 555-0142').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Phone' })).not.toBeInTheDocument()
  })

  it('renders a stored address as a mailto: link', () => {
    const task = createMockTask({ title: 'Email the office', email: 'office@school.org' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(document.querySelector('a[href="mailto:office@school.org"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Email' })).not.toBeInTheDocument()
  })

  it('saves a typed number on blur', async () => {
    const user = userEvent.setup()
    const onPhoneChange = vi.fn()
    const task = createMockTask({ title: 'bare' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
      onPhoneChange={onPhoneChange}
    />)
    await user.click(screen.getByRole('button', { name: 'Phone' }))
    await user.type(screen.getByLabelText('Phone'), '413-555-0142')
    await user.tab()
    expect(onPhoneChange).toHaveBeenCalledWith('413-555-0142')
  })
})
