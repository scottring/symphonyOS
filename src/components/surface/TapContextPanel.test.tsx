import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { TapContextPanel } from './TapContextPanel'
import { createMockTask, createMockContact, createMockProject } from '@/test/mocks/factories'

vi.mock('@/hooks/useChoices', () => ({
  CHOICES_UPDATED: 'symphony-choices-updated',
  useGoalChoices: () => ({ rows: [], loading: false, refetch: vi.fn(), create: vi.fn() }),
}))

vi.mock('@/hooks/useGoalLog', () => ({
  useGoalLog: () => ({ log: { upcoming: [], passed: [], done: [] }, entries: [], loading: false, refetch: vi.fn() }),
}))

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

  it('shows Choices for a goal task and not for an ordinary task', () => {
    const goal = createMockTask({ title: 'Redo roof', isGoal: true })
    const { unmount } = render(<TapContextPanel
      task={goal} contacts={[]} projects={[]} events={[]} familyMembers={[]}
      siblingTaskCandidates={[]} allTasks={[goal]} {...baseHandlers}
    />)
    expect(screen.getByText('Choices')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Log' })).toBeInTheDocument()
    unmount()
    const plain = createMockTask({ title: 'Call', isGoal: false })
    render(<TapContextPanel
      task={plain} contacts={[]} projects={[]} events={[]} familyMembers={[]}
      siblingTaskCandidates={[]} allTasks={[plain]} {...baseHandlers}
    />)
    expect(screen.queryByText('Choices')).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Log' })).toBeNull()
  })

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

  // S2-26: the pane named no date for the task it was showing.
  it('draws the host\u2019s timing control under the title', () => {
    const task = createMockTask({ title: 'Call Dr. Smith' })
    render(<TapContextPanel
      task={task} contacts={[]} projects={[]} events={[]} familyMembers={[]}
      siblingTaskCandidates={[]} allTasks={[task]} {...baseHandlers}
      timingControl={<button type="button">Tue, Sep 22 · any time</button>}
    />)
    expect(screen.getByRole('button', { name: 'Tue, Sep 22 · any time' })).toBeInTheDocument()
  })

  // Connected planning: details lead with what the task is FOR.
  it('draws the goal a task serves before its when', () => {
    const task = createMockTask({ title: 'Buy game tickets' })
    render(<TapContextPanel
      task={task} contacts={[]} projects={[]} events={[]} familyMembers={[]}
      siblingTaskCandidates={[]} allTasks={[task]} {...baseHandlers}
      purpose={<p>For Take Kaleb to an Islanders game</p>}
      timingControl={<button type="button">Choose when</button>}
    />)
    const purpose = screen.getByText(/For Take Kaleb/)
    const when = screen.getByRole('button', { name: 'Choose when' })
    expect(purpose.compareDocumentPosition(when) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders contact when linked', () => {
    const contact = createMockContact({ id: 'c1', name: 'Dr. Smith', phone: '555-0107' })
    const task = createMockTask({ contactId: 'c1' })
    render(<TapContextPanel
      task={task}
      contacts={[contact]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    // Named in "What you'll need" (with Call) and in the People section.
    expect(screen.getAllByText('Dr. Smith').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Call Dr. Smith' })).toHaveAttribute('href', 'tel:5550107')
    expect(screen.getAllByText(/555-0107/).length).toBeGreaterThan(0)
  })

  // Projects are hidden from the product (2026-09-02 — see the note in
  // Sidebar.tsx). The task still CARRIES its projectId and still inherits the
  // project's phone (below); the panel just never names the project any more.
  it('never names the linked project', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam — Health' })
    const task = createMockTask({ projectId: 'p1' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[project]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.queryByText('Liam — Health')).not.toBeInTheDocument()
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

  // PanelProjectContext ("From <project>" — the vendor's site, the contractor's
  // number, attributed to the project) is deleted with the noun. The task's own
  // context is all the panel shows now.
  it('does not attribute inherited context to a project', () => {
    const project = createMockProject({
      id: 'p1',
      name: 'Kitchen renovation',
      phoneNumber: '555-8890',
      links: [{ url: 'https://example.com/tile-spec', title: 'Tile spec' }],
    })
    const task = createMockTask({ projectId: 'p1', phoneNumber: '555-0001' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[project]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.queryByText('From Kitchen renovation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tile spec/ })).not.toBeInTheDocument()
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
    expect(screen.getAllByText('Sub one').length).toBeGreaterThan(0)
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
    fireEvent.click(screen.getByRole('button', { name: /life area/i }))
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
    // Hairline rules between the sections that show
    expect(article!.className).toMatch(/:border-t/)
    expect(article!.className).toMatch(/border-neutral-200/)
    // Mobile padding tighter than desktop
    expect(article!.className).toMatch(/px-4/)
    // Py-4 rhythm applied to direct children
    expect(article!.className).toMatch(/:py-4/)
    // First child has collapsed top padding, last child has collapsed bottom padding
    expect(article!.className).toMatch(/:pt-0/)
    expect(article!.className).toMatch(/:pb-0/)
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

    // Every one of them is still one tap away, from "What you'll need".
    for (const name of ['+ Place', '+ Note', '+ File', '+ Supplies or steps', '+ Link', '+ Contact']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    // The bottom Add row keeps only how to reach someone.
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument()
  })

  it('reveals a field when its Add chip is clicked, and drops the chip', async () => {
    const user = userEvent.setup()
    const task = createMockTask({ title: 'bare' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    await user.click(screen.getByRole('button', { name: '+ Note' }))
    expect(await screen.findByText(/add notes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Note' })).not.toBeInTheDocument()
  })

  it('shows a field as a real section, and no chip, when it already has content', () => {
    const task = createMockTask({ title: 'has notes', notes: 'measurements are 30x40' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getAllByText(/measurements are 30x40/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '+ Note' })).not.toBeInTheDocument()
  })

  // ── Phone and email: how to reach whoever the task requires ───────────────

  it('offers Phone and Email chips on a task that has neither', () => {
    const task = createMockTask({ title: 'bare' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    expect(screen.getByRole('button', { name: '+ Phone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Email' })).toBeInTheDocument()
  })

  it('shows a stored number in the Phone section without a second call link', () => {
    const task = createMockTask({ title: 'Call the school', phoneNumber: '(413) 555-0142' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
      {...baseHandlers}
    />)
    // The action bar and "What you'll need" carry the call; the Phone section
    // is the editor, so the number appears there as text, not another tel: link.
    const editor = screen.getByRole('button', { name: 'Remove phone' }).closest('section')!
    expect(editor.querySelector('a[href^="tel:"]')).toBeNull()
    expect(screen.getByRole('link', { name: 'Call (413) 555-0142' })).toHaveAttribute('href', 'tel:4135550142')
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
    await user.click(screen.getByRole('button', { name: '+ Phone' }))
    await user.type(screen.getByLabelText('Phone'), '413-555-0142')
    await user.tab()
    expect(onPhoneChange).toHaveBeenCalledWith('413-555-0142')
  })

  // ── Prepared to act: "What you'll need" ──────────────────────────────────

  it('leads the details with what you will need, and reads the plan above without copying it', () => {
    const milestone = createMockTask({ id: 'm1', title: 'Classroom ready', links: [{ url: 'https://supplies.test', title: 'Supply list' }] })
    const task = createMockTask({ id: 'w1', title: 'Shop for class supplies', sourceId: 'm1' })
    render(<TapContextPanel
      task={task}
      contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task, milestone]}
      {...baseHandlers}
    />)
    const prep = screen.getByRole('region', { name: 'What you’ll need' })
    expect(prep).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Supply list' })).toHaveAttribute('href', 'https://supplies.test')
    expect(screen.getByRole('group', { name: 'From Classroom ready' })).toBeInTheDocument()
    expect(task.links ?? []).toHaveLength(0)
  })

  // Today, trimmed (2026-10-14): a row is tick, drag and tap, so every job
  // the row's menus did has to be here.
  describe('the jobs the Today row menus did', () => {
    const renderPanel = (taskOver: Parameters<typeof createMockTask>[0] = {}, extra: Record<string, unknown> = {}) => {
      const task = createMockTask({ title: 'Reply to Christian', ...taskOver })
      return render(<TapContextPanel
        task={task} contacts={[]} projects={[]} events={[]} familyMembers={[]}
        siblingTaskCandidates={[]} allTasks={[task]} {...baseHandlers} {...extra}
      />)
    }
    /** A chip, or the same job folded into the ⋯. */
    const job = async (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) => {
      const chip = screen.queryByRole('button', { name })
      if (chip) return chip
      await user.click(screen.getByRole('button', { name: 'More actions' }))
      return within(screen.getByRole('group', { name: 'More actions' })).getByRole('button', { name })
    }

    it('offers none of them when the host wires none', () => {
      renderPanel()
      for (const name of ['Bring up', 'Waiting for…', 'Need today']) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      }
    })

    it('Bring up is the discussion now: no separate flag chip (discussions v2)', async () => {
      const onUpdateDiscussion = vi.fn()
      renderPanel({}, { onUpdateDiscussion })
      expect(screen.queryByRole('button', { name: 'Bring up' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'On the list' })).toBeNull()
    })

    it('a task already on To talk about keeps its question editable', async () => {
      const onUpdateDiscussion = vi.fn()
      const { user } = renderPanel({ needsDiscussion: true, discussionNote: '' }, { onUpdateDiscussion })
      await user.type(screen.getByPlaceholderText(/what's the question/i), 'Summer camp')
      await user.tab()
      expect(onUpdateDiscussion).toHaveBeenCalledWith({ needsDiscussion: true, discussionNote: 'Summer camp' })
    })

    it('Waiting for… opens the sentence and saves it', async () => {
      const onSaveWaiting = vi.fn()
      const { user } = renderPanel({}, { onSaveWaiting, onClearWaiting: vi.fn() })
      await user.click(await job(user, 'Waiting for…'))
      await user.type(screen.getByPlaceholderText(/pizza Saturday/), 'Guy to call back')
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(onSaveWaiting).toHaveBeenCalledWith('Guy to call back', undefined)
    })

    it('a waiting task can stop waiting', async () => {
      const onClearWaiting = vi.fn()
      const { user } = renderPanel({ isWaiting: true, waitingFor: 'Guy' }, { onSaveWaiting: vi.fn(), onClearWaiting })
      await user.click(await job(user, 'Waiting'))
      await user.click(screen.getByRole('button', { name: 'Not waiting anymore' }))
      expect(onClearWaiting).toHaveBeenCalledTimes(1)
    })

    it('Need today toggles the mark, and says when it is set', async () => {
      const onToggleNeededToday = vi.fn()
      const { user, unmount } = renderPanel({}, { onToggleNeededToday, neededToday: false })
      await user.click(await job(user, 'Need today'))
      expect(onToggleNeededToday).toHaveBeenCalledTimes(1)
      unmount()
      renderPanel({}, { onToggleNeededToday, neededToday: true })
      expect(await job(user, 'Needed today')).toBeInTheDocument()
    })

    it('Remove from the day sits in the ⋯ with Delete', async () => {
      const onRemoveFromDay = vi.fn()
      const { user } = renderPanel({}, { onRemoveFromDay, removeFromDayLabel: 'Remove from today' })
      await user.click(screen.getByRole('button', { name: 'More actions' }))
      const menu = within(screen.getByRole('group', { name: 'More actions' }))
      expect(menu.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      await user.click(menu.getByRole('button', { name: 'Remove from today' }))
      expect(onRemoveFromDay).toHaveBeenCalledTimes(1)
    })

    it('with every job wired there is still exactly one ⋯', () => {
      renderPanel({ phoneNumber: '555-0100', location: '1 Main St' }, {
        onUpdateDiscussion: vi.fn(), onSaveWaiting: vi.fn(), onToggleNeededToday: vi.fn(),
        onRemoveFromDay: vi.fn(), onAssistMutate: vi.fn(),
      })
      expect(screen.getAllByRole('button', { name: 'More actions' })).toHaveLength(1)
    })
  })
})
