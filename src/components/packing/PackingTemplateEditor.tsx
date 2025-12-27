import { useState, type KeyboardEvent } from 'react'
import { usePacking } from '@/hooks/usePacking'
import type { PackingTemplate } from '@/hooks/usePacking'
import type { PackingNode } from '@/types/trip'
import { X, Trash2, Type, List } from 'lucide-react'

interface PackingTemplateEditorProps {
  template?: PackingTemplate
  onClose: () => void
  onSave: () => void
}

export function PackingTemplateEditor({ template, onClose, onSave }: PackingTemplateEditorProps) {
  const { createTemplate, updateTemplate } = usePacking()
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [nodes, setNodes] = useState<PackingNode[]>(template?.nodes || [])

  // Bulk paste state
  const [showBulkPaste, setShowBulkPaste] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const addHeading = (level: 1 | 2 | 3 | 4) => {
    setNodes([...nodes, { type: 'heading', level, text: '' }])
  }

  const addItem = () => {
    setNodes([...nodes, { type: 'item', text: '', checked: false }])
  }

  const updateNode = (index: number, text: string) => {
    setNodes(nodes.map((node, i) => (i === index ? { ...node, text } : node)))
  }

  const deleteNode = (index: number) => {
    setNodes(nodes.filter((_, i) => i !== index))
  }

  const parseBulkText = (text: string): PackingNode[] => {
    const lines = text.split('\n')
    const parsed: PackingNode[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Remove leading bullet characters (•, -, *, etc)
      const withoutBullet = trimmed.replace(/^[•\-\*]\s*/, '')

      // Check if it's a heading (ends with colon or is ALL CAPS with colon)
      if (trimmed.includes(':')) {
        // Remove trailing colon
        const headingText = withoutBullet.replace(/:$/, '').trim()

        // Determine level based on case and format
        let level: 1 | 2 | 3 | 4 = 2
        if (trimmed.startsWith('FOR ') || trimmed === trimmed.toUpperCase()) {
          level = 1 // Top-level headings like "FOR IRIS:" or "FAMILY SHARED:"
        } else if (headingText.length > 0) {
          level = 2 // Regular headings like "Winter Outerwear:"
        }

        parsed.push({ type: 'heading', level, text: headingText })
      }
      // Otherwise it's an item
      else if (withoutBullet.length > 0) {
        parsed.push({ type: 'item', text: withoutBullet, checked: false })
      }
    }

    return parsed
  }

  const handleBulkPaste = () => {
    const newNodes = parseBulkText(bulkText)
    setNodes([...nodes, ...newNodes])
    setBulkText('')
    setShowBulkPaste(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Add new item after current one
      const newNodes = [...nodes]
      newNodes.splice(index + 1, 0, { type: 'item', text: '', checked: false })
      setNodes(newNodes)
      // Focus next input after a brief delay
      setTimeout(() => {
        const nextInput = document.querySelector<HTMLInputElement>(`[data-node-index="${index + 1}"]`)
        nextInput?.focus()
      }, 10)
    } else if (e.key === 'Backspace' && nodes[index].text === '') {
      e.preventDefault()
      deleteNode(index)
      // Focus previous input
      if (index > 0) {
        setTimeout(() => {
          const prevInput = document.querySelector<HTMLInputElement>(`[data-node-index="${index - 1}"]`)
          prevInput?.focus()
        }, 10)
      }
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a template name')
      return
    }

    if (nodes.length === 0) {
      alert('Please add at least one item')
      return
    }

    try {
      setSaving(true)

      if (template) {
        await updateTemplate(template.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          nodes,
        })
      } else {
        await createTemplate(name.trim(), nodes, description.trim() || undefined)
      }

      onSave()
    } catch (err) {
      console.error('Failed to save template:', err)
      alert('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const itemCount = nodes.filter(n => n.type === 'item').length
  const sectionCount = nodes.filter(n => n.type === 'heading').length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-display">{template ? 'Edit Template' : 'New Packing Template'}</h2>
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

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input-base w-full resize-none"
              rows={2}
              placeholder="Brief description of this packing template"
            />
          </div>

          {/* Add Buttons */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">Items ({itemCount} items, {sectionCount} sections)</label>
              <div className="flex gap-2">
                <button onClick={() => setShowBulkPaste(true)} className="btn bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm px-3 py-1">
                  Bulk Paste
                </button>
                <button onClick={() => addHeading(1)} className="btn bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-1">
                  <Type size={14} className="inline mr-1" />
                  H1
                </button>
                <button onClick={() => addHeading(2)} className="btn bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-1">
                  <Type size={14} className="inline mr-1" />
                  H2
                </button>
                <button onClick={() => addHeading(3)} className="btn bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-1">
                  <Type size={14} className="inline mr-1" />
                  H3
                </button>
                <button onClick={addItem} className="btn-primary text-sm px-3 py-1">
                  <List size={14} className="inline mr-1" />
                  Item
                </button>
              </div>
            </div>
          </div>

          {/* Editable List */}
          <div className="border border-gray-200 rounded-lg p-4 bg-white min-h-[400px]">
            {nodes.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>Click a button above to add headings or items</p>
                <p className="text-sm mt-2">Press Enter to add new items, Backspace on empty items to delete</p>
              </div>
            ) : (
              <div className="space-y-2">
                {nodes.map((node, index) => (
                  <div key={index} className="flex items-center gap-2 group">
                    {node.type === 'heading' ? (
                      <input
                        type="text"
                        value={node.text}
                        onChange={e => updateNode(index, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, index)}
                        data-node-index={index}
                        className={`flex-1 outline-none border-b border-transparent hover:border-gray-300 focus:border-blue-500 px-2 py-1 ${
                          node.level === 1 ? 'text-3xl font-display font-bold' :
                          node.level === 2 ? 'text-2xl font-display font-semibold' :
                          node.level === 3 ? 'text-xl font-semibold' :
                          'text-lg font-semibold'
                        }`}
                        placeholder={`Heading ${node.level}`}
                      />
                    ) : (
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-gray-400">•</span>
                        <input
                          type="text"
                          value={node.text}
                          onChange={e => updateNode(index, e.target.value)}
                          onKeyDown={e => handleKeyDown(e, index)}
                          data-node-index={index}
                          className="flex-1 outline-none border-b border-transparent hover:border-gray-300 focus:border-blue-500 px-2 py-1"
                          placeholder="Item text"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => deleteNode(index)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

      {/* Bulk Paste Modal */}
      {showBulkPaste && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-display">Bulk Paste</h3>
              <button onClick={() => setShowBulkPaste(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-600 mb-3">
                Paste your formatted list. Lines with ":" become headings, lines with bullets (•, -, *) become items.
              </p>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                className="input-base w-full font-mono text-sm resize-none"
                rows={20}
                placeholder={`FOR IRIS:
Winter Outerwear:
• Heavy winter coat (waterproof, insulated)
• Waterproof snow pants
• Warm hat covering ears

FAMILY SHARED:
Travel Entertainment:
• Tablets/phones with downloaded shows
• Card games (UNO, Spot It)`}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
              <button onClick={() => setShowBulkPaste(false)} className="btn bg-white hover:bg-gray-100 text-gray-700">
                Cancel
              </button>
              <button onClick={handleBulkPaste} className="btn-primary">
                Add to List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
