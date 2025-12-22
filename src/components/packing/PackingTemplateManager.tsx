import { useState } from 'react'
import { usePacking } from '@/hooks/usePacking'
import { PackingTemplateEditor } from './PackingTemplateEditor'
import type { PackingTemplate } from '@/hooks/usePacking'
import { Plus, Edit, Copy, Trash2 } from 'lucide-react'

export function PackingTemplateManager() {
  const { templates, loading, error, deleteTemplate, duplicateTemplate } = usePacking()
  const [editingTemplate, setEditingTemplate] = useState<PackingTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const handleDuplicate = async (template: PackingTemplate) => {
    try {
      setDuplicatingId(template.id)
      const newName = prompt('Enter name for duplicated template:', `${template.name} (Copy)`)
      if (!newName) return

      await duplicateTemplate(template.id, newName)
    } catch (err) {
      console.error('Failed to duplicate template:', err)
      alert('Failed to duplicate template')
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleDelete = async (template: PackingTemplate) => {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return

    try {
      await deleteTemplate(template.id)
    } catch (err) {
      console.error('Failed to delete template:', err)
      alert('Failed to delete template')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading templates...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    )
  }

  const customTemplates = templates.filter(t => !t.isDefault)
  const defaultTemplates = templates.filter(t => t.isDefault)

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display">Packing Templates</h1>
          <p className="text-gray-600 mt-2">Create and manage reusable packing lists for trips</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          New Template
        </button>
      </div>

      {/* Custom Templates */}
      {customTemplates.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-display mb-4">Your Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customTemplates.map(template => (
              <div key={template.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  {template.items.length} items
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="flex-1 btn bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center gap-1"
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(template)}
                    disabled={duplicatingId === template.id}
                    className="flex-1 btn bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center gap-1"
                  >
                    <Copy size={16} />
                    {duplicatingId === template.id ? 'Copying...' : 'Duplicate'}
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    className="btn bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Default Templates */}
      {defaultTemplates.length > 0 && (
        <div>
          <h2 className="text-xl font-display mb-4">Default Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {defaultTemplates.map(template => (
              <div key={template.id} className="card p-4 bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  {template.items.length} items
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDuplicate(template)}
                    disabled={duplicatingId === template.id}
                    className="flex-1 btn bg-white hover:bg-gray-100 text-gray-700 flex items-center justify-center gap-1"
                  >
                    <Copy size={16} />
                    {duplicatingId === template.id ? 'Copying...' : 'Duplicate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {customTemplates.length === 0 && defaultTemplates.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-4">No templates yet</p>
          <button onClick={() => setIsCreating(true)} className="btn-primary">
            Create your first template
          </button>
        </div>
      )}

      {/* Editor Modals */}
      {isCreating && (
        <PackingTemplateEditor
          onClose={() => setIsCreating(false)}
          onSave={() => setIsCreating(false)}
        />
      )}

      {editingTemplate && (
        <PackingTemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={() => setEditingTemplate(null)}
        />
      )}
    </div>
  )
}
