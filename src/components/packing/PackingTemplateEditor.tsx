import { useState } from 'react'
import { usePacking } from '@/hooks/usePacking'
import type { PackingTemplate } from '@/hooks/usePacking'
import type { PackingItem, PackingCategory } from '@/types/trip'
import { X, Plus, Trash2, GripVertical } from 'lucide-react'

interface PackingTemplateEditorProps {
  template?: PackingTemplate
  onClose: () => void
  onSave: () => void
}

const CATEGORY_OPTIONS: { value: PackingCategory; label: string }[] = [
  { value: 'clothing', label: 'Clothing' },
  { value: 'toiletries', label: 'Toiletries' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'documents', label: 'Documents' },
  { value: 'ev_equipment', label: 'EV Equipment' },
  { value: 'food_drinks', label: 'Food & Drinks' },
  { value: 'recreation', label: 'Recreation' },
  { value: 'other', label: 'Other' },
]

export function PackingTemplateEditor({ template, onClose, onSave }: PackingTemplateEditorProps) {
  const { createTemplate, updateTemplate } = usePacking()
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [items, setItems] = useState<PackingItem[]>(template?.items || [])

  // New item state
  const [showNewItem, setShowNewItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<PackingCategory>('other')
  const [newItemQuantity, setNewItemQuantity] = useState<number | undefined>(undefined)
  const [newItemEssential, setNewItemEssential] = useState(false)

  const handleAddItem = () => {
    if (!newItemName.trim()) return

    const newItem: PackingItem = {
      name: newItemName.trim(),
      category: newItemCategory,
      quantity: newItemQuantity,
      essential: newItemEssential,
    }

    setItems([...items, newItem])
    setNewItemName('')
    setNewItemCategory('other')
    setNewItemQuantity(undefined)
    setNewItemEssential(false)
    setShowNewItem(false)
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleToggleEssential = (index: number) => {
    setItems(items.map((item, i) => (i === index ? { ...item, essential: !item.essential } : item)))
  }

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a template name')
      return
    }

    if (items.length === 0) {
      alert('Please add at least one item')
      return
    }

    try {
      setSaving(true)

      if (template) {
        // Update existing template
        await updateTemplate(template.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          items,
        })
      } else {
        // Create new template
        await createTemplate(name.trim(), items, description.trim() || undefined)
      }

      onSave()
    } catch (err) {
      console.error('Failed to save template:', err)
      alert('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  // Group items by category
  const itemsByCategory = items.reduce(
    (acc, item, index) => {
      if (!acc[item.category]) {
        acc[item.category] = []
      }
      acc[item.category].push({ item, index })
      return acc
    },
    {} as Record<PackingCategory, Array<{ item: PackingItem; index: number }>>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-display">
            {template ? 'Edit Template' : 'New Packing Template'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Name and Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-base w-full text-xl font-display"
              placeholder="e.g., Weekend Beach Trip"
              autoFocus
            />
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input-base w-full resize-none"
              rows={2}
              placeholder="Brief description of this packing template"
            />
          </div>

          {/* Items List */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Items ({items.length})</h3>
              <button
                onClick={() => setShowNewItem(true)}
                className="btn-primary flex items-center gap-1 text-sm"
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>

            {/* New Item Form */}
            {showNewItem && (
              <div className="card p-4 mb-4 bg-blue-50 border-blue-200">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      className="input-base w-full"
                      placeholder="Item name"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddItem()
                        if (e.key === 'Escape') {
                          setShowNewItem(false)
                          setNewItemName('')
                        }
                      }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <select
                      value={newItemCategory}
                      onChange={e => setNewItemCategory(e.target.value as PackingCategory)}
                      className="input-base w-full"
                    >
                      {CATEGORY_OPTIONS.map(cat => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      value={newItemQuantity || ''}
                      onChange={e => setNewItemQuantity(e.target.value ? Number(e.target.value) : undefined)}
                      className="input-base w-full"
                      placeholder="Quantity (optional)"
                      min="1"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newItemEssential}
                        onChange={e => setNewItemEssential(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Essential item</span>
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddItem} className="btn-primary flex-1">
                    Add Item
                  </button>
                  <button
                    onClick={() => {
                      setShowNewItem(false)
                      setNewItemName('')
                    }}
                    className="btn bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Items grouped by category */}
            {Object.keys(itemsByCategory).length === 0 && !showNewItem && (
              <div className="text-center py-8 text-gray-500">
                No items yet. Click "Add Item" to get started.
              </div>
            )}

            {CATEGORY_OPTIONS.map(({ value: category, label }) => {
              const categoryItems = itemsByCategory[category]
              if (!categoryItems || categoryItems.length === 0) return null

              return (
                <div key={category} className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    {label}
                  </h4>
                  <div className="space-y-2">
                    {categoryItems.map(({ item, index }) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50"
                      >
                        <GripVertical size={16} className="text-gray-400" />
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          {item.quantity && (
                            <div className="text-sm text-gray-500">Qty: {item.quantity}</div>
                          )}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.essential}
                            onChange={() => handleToggleEssential(index)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-600">Essential</span>
                        </label>
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button onClick={onClose} className="btn bg-white hover:bg-gray-100 text-gray-700">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : template ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
