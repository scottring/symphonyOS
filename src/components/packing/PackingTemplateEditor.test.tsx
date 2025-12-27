import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackingTemplateEditor } from './PackingTemplateEditor'
import type { PackingTemplate } from '@/hooks/usePacking'
import type { PackingNode } from '@/types/trip'

// Mock usePacking hook
const mockCreateTemplate = vi.fn()
const mockUpdateTemplate = vi.fn()

vi.mock('@/hooks/usePacking', () => ({
  usePacking: () => ({
    createTemplate: mockCreateTemplate,
    updateTemplate: mockUpdateTemplate,
  }),
}))

function createMockPackingNodes(): PackingNode[] {
  return [
    { type: 'heading', level: 2, text: 'Toiletries' },
    { type: 'item', text: 'Toothbrush', checked: false },
    { type: 'heading', level: 2, text: 'Clothing' },
    { type: 'item', text: 'Clothes', checked: false },
  ]
}

function createMockTemplate(overrides: Partial<PackingTemplate> = {}): PackingTemplate {
  return {
    id: 'template-1',
    userId: 'test-user-id',
    name: 'Weekend Trip',
    description: 'Basic items for a weekend getaway',
    nodes: createMockPackingNodes(),
    isDefault: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('PackingTemplateEditor', () => {
  const mockOnClose = vi.fn()
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Create Mode', () => {
    it('renders with "New Packing Template" title when creating', () => {
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      expect(screen.getByText('New Packing Template')).toBeInTheDocument()
    })

    it('renders empty form fields', () => {
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      const nameInput = screen.getByPlaceholderText('e.g., Weekend Beach Trip')
      const descriptionInput = screen.getByPlaceholderText(
        'Brief description of this packing template'
      )

      expect(nameInput).toHaveValue('')
      expect(descriptionInput).toHaveValue('')
    })

    it('shows "Create Template" button', () => {
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      expect(
        screen.getByRole('button', { name: 'Create Template' })
      ).toBeInTheDocument()
    })

    it('allows entering template name and description', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      const nameInput = screen.getByPlaceholderText('e.g., Weekend Beach Trip')
      const descriptionInput = screen.getByPlaceholderText(
        'Brief description of this packing template'
      )

      await user.type(nameInput, 'My Custom Template')
      await user.type(descriptionInput, 'This is a test description')

      expect(nameInput).toHaveValue('My Custom Template')
      expect(descriptionInput).toHaveValue('This is a test description')
    })
  })

  describe('Edit Mode', () => {
    it('renders with "Edit Template" title when editing', () => {
      const template = createMockTemplate()

      render(
        <PackingTemplateEditor
          template={template}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByText('Edit Template')).toBeInTheDocument()
    })

    it('pre-fills form fields with template data', () => {
      const template = createMockTemplate()

      render(
        <PackingTemplateEditor
          template={template}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      )

      const nameInput = screen.getByDisplayValue('Weekend Trip')
      const descriptionInput = screen.getByDisplayValue(
        'Basic items for a weekend getaway'
      )

      expect(nameInput).toBeInTheDocument()
      expect(descriptionInput).toBeInTheDocument()
    })

    it('shows "Save Changes" button', () => {
      const template = createMockTemplate()

      render(
        <PackingTemplateEditor
          template={template}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      )

      expect(
        screen.getByRole('button', { name: 'Save Changes' })
      ).toBeInTheDocument()
    })

    it('displays existing items grouped by category', () => {
      const template = createMockTemplate()

      render(
        <PackingTemplateEditor
          template={template}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      )

      expect(screen.getByText('TOILETRIES')).toBeInTheDocument()
      expect(screen.getByText('CLOTHING')).toBeInTheDocument()
      expect(screen.getByText('Toothbrush')).toBeInTheDocument()
      expect(screen.getByText('Clothes')).toBeInTheDocument()
    })
  })

  describe('Adding Items', () => {
    it('shows add item form when "Add Item" button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      const addButton = screen.getByRole('button', { name: 'Add Item' })
      await user.click(addButton)

      expect(screen.getByPlaceholderText('Item name')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('allows adding a new item', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      // Open add item form
      const addButton = screen.getByRole('button', { name: 'Add Item' })
      await user.click(addButton)

      // Fill in item details
      const nameInput = screen.getByPlaceholderText('Item name')
      await user.type(nameInput, 'Sunscreen')

      const categorySelect = screen.getByRole('combobox')
      await user.selectOptions(categorySelect, 'toiletries')

      const essentialCheckbox = screen.getByRole('checkbox', {
        name: 'Essential item',
      })
      await user.click(essentialCheckbox)

      // Submit the item
      const submitButton = screen.getByRole('button', { name: /Add Item/i })
      await user.click(submitButton)

      // Verify item was added
      expect(screen.getByText('Sunscreen')).toBeInTheDocument()
    })

    it('hides add item form when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      // Open add item form
      const addButton = screen.getByRole('button', { name: 'Add Item' })
      await user.click(addButton)

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      // Form should be hidden
      expect(screen.queryByPlaceholderText('Item name')).not.toBeInTheDocument()
    })

    it('clears form after adding an item', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      // Open add item form
      const addButton = screen.getByRole('button', { name: 'Add Item' })
      await user.click(addButton)

      // Fill and submit
      const nameInput = screen.getByPlaceholderText('Item name')
      await user.type(nameInput, 'Sunscreen')

      const submitButton = screen.getByRole('button', { name: /Add Item/i })
      await user.click(submitButton)

      // Open form again
      const addButtonAgain = screen.getByRole('button', { name: 'Add Item' })
      await user.click(addButtonAgain)

      // Form should be empty
      const nameInputAgain = screen.getByPlaceholderText('Item name')
      expect(nameInputAgain).toHaveValue('')
    })
  })

  describe('Removing Items', () => {
    it('removes an item when delete button is clicked', async () => {
      const user = userEvent.setup()
      const template = createMockTemplate()

      render(
        <PackingTemplateEditor
          template={template}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      )

      // Find and click the delete button for "Toothbrush"
      const deleteButtons = screen.getAllByRole('button')
      const deleteButton = deleteButtons.find(
        btn => btn.querySelector('svg') && btn.closest('div')?.textContent?.includes('Toothbrush')
      )

      if (deleteButton) {
        await user.click(deleteButton)
      }

      // Item should be removed
      await waitFor(() => {
        expect(screen.queryByText('Toothbrush')).not.toBeInTheDocument()
      })
    })
  })

  describe('Saving Template', () => {
    it('creates a new template when save button is clicked', async () => {
      const user = userEvent.setup()
      mockCreateTemplate.mockResolvedValue({
        id: 'new-template-id',
        name: 'New Template',
        items: [],
      })

      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      // Fill in template name
      const nameInput = screen.getByPlaceholderText('e.g., Weekend Beach Trip')
      await user.type(nameInput, 'New Template')

      // Add an item
      const addButton = screen.getByRole('button', { name: 'Add Item' })
      await user.click(addButton)

      const itemNameInput = screen.getByPlaceholderText('Item name')
      await user.type(itemNameInput, 'Test Item')

      const submitItemButton = screen.getByRole('button', { name: /Add Item/i })
      await user.click(submitItemButton)

      // Click create template
      const createButton = screen.getByRole('button', { name: 'Create Template' })
      await user.click(createButton)

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalledWith(
          'New Template',
          expect.arrayContaining([
            expect.objectContaining({ name: 'Test Item' }),
          ]),
          ''
        )
        expect(mockOnSave).toHaveBeenCalled()
      })
    })

    it('updates existing template when save button is clicked', async () => {
      const user = userEvent.setup()
      const template = createMockTemplate()

      mockUpdateTemplate.mockResolvedValue({
        ...template,
        name: 'Updated Template',
      })

      render(
        <PackingTemplateEditor
          template={template}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      )

      // Update template name
      const nameInput = screen.getByDisplayValue('Weekend Trip')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Template')

      // Click save changes
      const saveButton = screen.getByRole('button', { name: 'Save Changes' })
      await user.click(saveButton)

      await waitFor(() => {
        expect(mockUpdateTemplate).toHaveBeenCalledWith(
          'template-1',
          expect.objectContaining({
            name: 'Updated Template',
          })
        )
        expect(mockOnSave).toHaveBeenCalled()
      })
    })

    it('shows alert when trying to save without a name', async () => {
      const user = userEvent.setup()
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      // Try to save without entering a name
      const createButton = screen.getByRole('button', { name: 'Create Template' })
      await user.click(createButton)

      expect(alertSpy).toHaveBeenCalledWith('Please enter a template name')
      alertSpy.mockRestore()
    })

    it('shows alert when trying to save without items', async () => {
      const user = userEvent.setup()
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      // Enter a name but no items
      const nameInput = screen.getByPlaceholderText('e.g., Weekend Beach Trip')
      await user.type(nameInput, 'Empty Template')

      const createButton = screen.getByRole('button', { name: 'Create Template' })
      await user.click(createButton)

      expect(alertSpy).toHaveBeenCalledWith('Please add at least one item')
      alertSpy.mockRestore()
    })
  })

  describe('Closing', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      const closeButton = screen.getByRole('button', { name: '' }) // X button
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <PackingTemplateEditor onClose={mockOnClose} onSave={mockOnSave} />
      )

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })
})
