import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PackingItem } from '@/types/trip'

export interface PackingTemplate {
  id: string
  userId: string
  name: string
  description?: string
  items: PackingItem[]
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

interface DbPackingTemplate {
  id: string
  user_id: string
  name: string
  description: string | null
  items: PackingItem[]
  is_default: boolean
  created_at: string
  updated_at: string
}

function dbTemplateToTemplate(dbTemplate: DbPackingTemplate): PackingTemplate {
  return {
    id: dbTemplate.id,
    userId: dbTemplate.user_id,
    name: dbTemplate.name,
    description: dbTemplate.description ?? undefined,
    items: dbTemplate.items,
    isDefault: dbTemplate.is_default,
    createdAt: new Date(dbTemplate.created_at),
    updatedAt: new Date(dbTemplate.updated_at),
  }
}

export function usePacking() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<PackingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch templates on mount and when user changes
  useEffect(() => {
    if (!user) {
      setTemplates([])
      setLoading(false)
      return
    }

    async function fetchTemplates() {
      try {
        setLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from('packing_templates')
          .select('*')
          .order('name')

        if (fetchError) throw fetchError

        setTemplates((data || []).map(dbTemplateToTemplate))
      } catch (err) {
        console.error('Error fetching packing templates:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch templates')
      } finally {
        setLoading(false)
      }
    }

    fetchTemplates()

    // Subscribe to realtime changes
    const channel = supabase
      .channel('packing_templates_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packing_templates',
        },
        () => {
          fetchTemplates()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  /**
   * Create a new packing template
   */
  const createTemplate = useCallback(
    async (name: string, items: PackingItem[], description?: string) => {
      if (!user) throw new Error('User not authenticated')

      try {
        const { data, error: insertError } = await supabase
          .from('packing_templates')
          .insert({
            user_id: user.id,
            name,
            description: description || null,
            items,
            is_default: false,
          })
          .select()
          .single()

        if (insertError) throw insertError

        const newTemplate = dbTemplateToTemplate(data)
        setTemplates(prev => [...prev, newTemplate].sort((a, b) => a.name.localeCompare(b.name)))
        return newTemplate
      } catch (err) {
        console.error('Error creating template:', err)
        throw err
      }
    },
    [user]
  )

  /**
   * Update an existing template
   */
  const updateTemplate = useCallback(
    async (id: string, updates: { name?: string; description?: string; items?: PackingItem[] }) => {
      if (!user) throw new Error('User not authenticated')

      try {
        const updateData: Record<string, unknown> = {}
        if (updates.name !== undefined) updateData.name = updates.name
        if (updates.description !== undefined) updateData.description = updates.description || null
        if (updates.items !== undefined) updateData.items = updates.items

        const { data, error: updateError } = await supabase
          .from('packing_templates')
          .update(updateData)
          .eq('id', id)
          .select()
          .single()

        if (updateError) throw updateError

        const updatedTemplate = dbTemplateToTemplate(data)
        setTemplates(prev =>
          prev.map(t => (t.id === id ? updatedTemplate : t)).sort((a, b) => a.name.localeCompare(b.name))
        )
        return updatedTemplate
      } catch (err) {
        console.error('Error updating template:', err)
        throw err
      }
    },
    [user]
  )

  /**
   * Delete a template
   */
  const deleteTemplate = useCallback(
    async (id: string) => {
      if (!user) throw new Error('User not authenticated')

      try {
        const { error: deleteError } = await supabase.from('packing_templates').delete().eq('id', id)

        if (deleteError) throw deleteError

        setTemplates(prev => prev.filter(t => t.id !== id))
      } catch (err) {
        console.error('Error deleting template:', err)
        throw err
      }
    },
    [user]
  )

  /**
   * Duplicate a template with a new name
   */
  const duplicateTemplate = useCallback(
    async (id: string, newName: string) => {
      if (!user) throw new Error('User not authenticated')

      const template = templates.find(t => t.id === id)
      if (!template) throw new Error('Template not found')

      return createTemplate(newName, template.items, template.description)
    },
    [user, templates, createTemplate]
  )

  return {
    templates,
    loading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  }
}
