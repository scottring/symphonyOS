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
  const [newItemForPerson, setNewItemForPerson] = useState('')

  // Bulk add state
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkCategory, setBulkCategory] = useState<PackingCategory>('other')
  const [bulkEssential, setBulkEssential] = useState(false)
  const [bulkForPerson, setBulkForPerson] = useState('')
  const [bulkSmartParse, setBulkSmartParse] = useState(true)

  // View toggle state
  const [groupBy, setGroupBy] = useState<'category' | 'person'>('category')

  const handleAddItem = () => {
    if (!newItemName.trim()) return

    const newItem: PackingItem = {
      name: newItemName.trim(),
      category: newItemCategory,
      quantity: newItemQuantity,
      essential: newItemEssential,
      for_person: newItemForPerson.trim() || undefined,
    }

    setItems([...items, newItem])
    setNewItemName('')
    setNewItemCategory('other')
    setNewItemQuantity(undefined)
    setNewItemEssential(false)
    setNewItemForPerson('')
    setShowNewItem(false)
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleToggleEssential = (index: number) => {
    setItems(items.map((item, i) => (i === index ? { ...item, essential: !item.essential } : item)))
  }

  const handleBulkAdd = () => {
    if (!bulkText.trim()) return

    let newItems: PackingItem[] = []

    if (bulkSmartParse) {
      // Smart parsing: detect person headers, category headers, and items
      const lines = bulkText.split('\n')
      let currentPerson: string | undefined = bulkForPerson.trim() || undefined
      let currentCategory: PackingCategory = bulkCategory

      // Category name mapping to PackingCategory enum
      const categoryMapping: Record<string, PackingCategory> = {
        outerwear: 'clothing',
        'winter outerwear': 'clothing',
        footwear: 'clothing',
        clothing: 'clothing',
        fitness: 'clothing',
        pool: 'recreation',
        'pool & activities': 'recreation',
        activities: 'recreation',
        essentials: 'other',
        toiletries: 'toiletries',
        electronics: 'electronics',
        documents: 'documents',
        entertainment: 'electronics',
        'travel entertainment': 'electronics',
      }

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Check for person header: "FOR IRIS:" or "FAMILY SHARED:"
        if (
          trimmed.toUpperCase().startsWith('FOR ') ||
          trimmed.toUpperCase() === 'FAMILY SHARED:' ||
          trimmed.toUpperCase().startsWith('FAMILY SHARED')
        ) {
          const match = trimmed.match(/^(?:FOR\s+)?(.+?)(?:\s*\([^)]*\))?:?$/i)
          if (match) {
            currentPerson = match[1].trim()
            continue
          }
        }

        // Check for category header: ends with ":" and doesn't start with "FOR"
        if (trimmed.endsWith(':') && !trimmed.toUpperCase().startsWith('FOR ')) {
          const categoryName = trimmed.slice(0, -1).toLowerCase().trim()
          currentCategory = categoryMapping[categoryName] || bulkCategory
          continue
        }

        // Parse item line
        // Remove bullet points (•, -, *, or numbers) and leading/trailing whitespace
        let itemText = trimmed
          .replace(/^[•\-\*]\s*/, '') // Remove bullet
          .replace(/^\d+\.\s*/, '') // Remove numbered list
          .trim()

        if (!itemText) continue

        // Try to extract quantity from start of text (e.g., "2 pairs gloves")
        let quantity: number | undefined = undefined
        const quantityMatch = itemText.match(/^(\d+)\s+/)
        if (quantityMatch) {
          quantity = parseInt(quantityMatch[1])
          itemText = itemText.replace(/^(\d+)\s+/, '')
        }

        // Check if there's a quantity in parentheses at the end (e.g., "Underwear (5)")
        const parenMatch = itemText.match(/\((\d+)\)$/)
        if (parenMatch) {
          quantity = parseInt(parenMatch[1])
          itemText = itemText.replace(/\s*\(\d+\)$/, '')
        }

        // Determine if essential based on category name
        const isEssential = currentCategory === 'documents' || bulkEssential

        newItems.push({
          name: itemText,
          category: currentCategory,
          quantity,
          essential: isEssential,
          for_person: currentPerson,
        })
      }
    } else {
      // Simple parsing: each line is a new item with same settings
      const lines = bulkText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)

      if (lines.length === 0) return

      newItems = lines.map(line => ({
        name: line,
        category: bulkCategory,
        essential: bulkEssential,
        for_person: bulkForPerson.trim() || undefined,
      }))
    }

    if (newItems.length === 0) return

    setItems([...items, ...newItems])
    setBulkText('')
    setBulkCategory('other')
    setBulkEssential(false)
    setBulkForPerson('')
    setShowBulkAdd(false)
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

  // Group items by person
  const itemsByPerson = items.reduce(
    (acc, item, index) => {
      const person = item.for_person || 'Unassigned'
      if (!acc[person]) {
        acc[person] = []
      }
      acc[person].push({ item, index })
      return acc
    },
    {} as Record<string, Array<{ item: PackingItem; index: number }>>
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
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Items ({items.length})</h3>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setGroupBy('category')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      groupBy === 'category'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    By Category
                  </button>
                  <button
                    onClick={() => setGroupBy('person')}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      groupBy === 'person'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    By Person
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowBulkAdd(true)
                    setShowNewItem(false)
                  }}
                  className="btn bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 flex items-center gap-1 text-sm"
                >
                  <Plus size={16} />
                  Bulk Add
                </button>
                <button
                  onClick={() => {
                    setShowNewItem(true)
                    setShowBulkAdd(false)
                  }}
                  className="btn-primary flex items-center gap-1 text-sm"
                >
                  <Plus size={16} />
                  Add Item
                </button>
              </div>
            </div>

            {/* Bulk Add Form */}
            {showBulkAdd && (
              <div className="card p-4 mb-4 bg-green-50 border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {bulkSmartParse ? 'Paste structured list' : 'Paste items (one per line)'}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkSmartParse}
                      onChange={e => setBulkSmartParse(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Smart parse</span>
                  </label>
                </div>
                <div className="mb-3">
                  <textarea
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    className="input-base w-full resize-none font-mono text-sm"
                    rows={12}
                    placeholder={
                      bulkSmartParse
                        ? 'FOR IRIS:\nWinter Outerwear:\n  • Heavy winter coat\n  • 2 pairs gloves\nFootwear:\n  • Insulated boots\n\nFOR KALEB:\nClothing:\n  • 3 pairs pants\n  • Underwear (5)'
                        : 'Winter coat\nSnow boots\nGloves\nScarf\nWarm socks'
                    }
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {bulkSmartParse
                      ? 'Smart parse detects person headers (FOR NAME:), category headers (Category:), and extracts quantities.'
                      : 'Each line becomes one item with the settings below.'}
                  </p>
                </div>
                {!bulkSmartParse && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={bulkCategory}
                        onChange={e => setBulkCategory(e.target.value as PackingCategory)}
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">For Person</label>
                      <input
                        type="text"
                        value={bulkForPerson}
                        onChange={e => setBulkForPerson(e.target.value)}
                        className="input-base w-full"
                        placeholder="Optional"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkEssential}
                          onChange={e => setBulkEssential(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm">Mark all as essential</span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleBulkAdd} className="btn-primary flex-1" disabled={!bulkText.trim()}>
                    Add Items
                  </button>
                  <button
                    onClick={() => {
                      setShowBulkAdd(false)
                      setBulkText('')
                    }}
                    className="btn bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                    <input
                      type="text"
                      value={newItemForPerson}
                      onChange={e => setNewItemForPerson(e.target.value)}
                      className="input-base w-full"
                      placeholder="For person (optional)"
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

            {/* Empty state */}
            {items.length === 0 && !showNewItem && !showBulkAdd && (
              <div className="text-center py-8 text-gray-500">
                No items yet. Click "Add Item" or "Bulk Add" to get started.
              </div>
            )}

            {/* Items grouped by category */}
            {groupBy === 'category' &&
              CATEGORY_OPTIONS.map(({ value: category, label }) => {
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
                            <div className="flex gap-2 text-sm text-gray-500">
                              {item.quantity && <span>Qty: {item.quantity}</span>}
                              {item.for_person && <span>• {item.for_person}</span>}
                            </div>
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

            {/* Items grouped by person */}
            {groupBy === 'person' &&
              Object.keys(itemsByPerson)
                .sort()
                .map(person => {
                  const personItems = itemsByPerson[person]
                  if (!personItems || personItems.length === 0) return null

                  return (
                    <div key={person} className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                        {person}
                      </h4>
                      <div className="space-y-2">
                        {personItems.map(({ item, index }) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50"
                          >
                            <GripVertical size={16} className="text-gray-400" />
                            <div className="flex-1">
                              <div className="font-medium">{item.name}</div>
                              <div className="flex gap-2 text-sm text-gray-500">
                                <span>{CATEGORY_OPTIONS.find(c => c.value === item.category)?.label}</span>
                                {item.quantity && <span>• Qty: {item.quantity}</span>}
                              </div>
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
