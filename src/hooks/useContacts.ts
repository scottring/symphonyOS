import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Contact } from '@/types/contact'

interface DbContact {
  id: string
  user_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function dbContactToContact(dbContact: DbContact): Contact {
  return {
    id: dbContact.id,
    name: dbContact.name,
    phone: dbContact.phone ?? undefined,
    email: dbContact.email ?? undefined,
    notes: dbContact.notes ?? undefined,
    createdAt: new Date(dbContact.created_at),
    updatedAt: new Date(dbContact.updated_at),
  }
}

export function useContacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch contacts on mount and when user changes
  useEffect(() => {
    if (!user) {
      setContacts([])
      setLoading(false)
      return
    }

    async function fetchContacts() {
      if (!user) return

      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setContacts((data as DbContact[]).map(dbContactToContact))
      setLoading(false)
    }

    fetchContacts()
  }, [user])

  const addContact = useCallback(async (contact: { name: string; phone?: string; email?: string; notes?: string }) => {
    if (!user) return null

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticContact: Contact = {
      id: tempId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      notes: contact.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setContacts((prev) => [...prev, optimisticContact].sort((a, b) => a.name.localeCompare(b.name)))

    const { data, error: insertError } = await supabase
      .from('contacts')
      .insert({
        user_id: user.id,
        name: contact.name,
        phone: contact.phone ?? null,
        email: contact.email ?? null,
        notes: contact.notes ?? null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setContacts((prev) => prev.filter((c) => c.id !== tempId))
      setError(insertError.message)
      return null
    }

    // Replace optimistic contact with real one
    const realContact = dbContactToContact(data as DbContact)
    setContacts((prev) =>
      prev.map((c) => (c.id === tempId ? realContact : c)).sort((a, b) => a.name.localeCompare(b.name))
    )

    return realContact
  }, [user])

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    const contact = contacts.find((c) => c.id === id)
    if (!contact) return

    // Optimistic update
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)).sort((a, b) => a.name.localeCompare(b.name))
    )

    // Convert Contact updates to DB format
    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone ?? null
    if (updates.email !== undefined) dbUpdates.email = updates.email ?? null
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null

    const { error: updateError } = await supabase
      .from('contacts')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? contact : c))
      )
      setError(updateError.message)
    }
  }, [contacts])

  const deleteContact = useCallback(async (id: string) => {
    // Save for rollback
    const contactToDelete = contacts.find((c) => c.id === id)
    if (!contactToDelete) return

    // Optimistic update
    setContacts((prev) => prev.filter((c) => c.id !== id))

    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      setContacts((prev) => [...prev, contactToDelete].sort((a, b) => a.name.localeCompare(b.name)))
      setError(deleteError.message)
    }
  }, [contacts])

  // Search contacts by name (case-insensitive)
  const searchContacts = useCallback((query: string): Contact[] => {
    if (!query.trim()) return contacts
    const lowerQuery = query.toLowerCase()
    return contacts.filter((c) => c.name.toLowerCase().includes(lowerQuery))
  }, [contacts])

  // Get contact by ID
  const getContactById = useCallback((id: string): Contact | undefined => {
    return contacts.find((c) => c.id === id)
  }, [contacts])

  // Create a contacts map for efficient lookup
  const contactsMap = useMemo(() => {
    const map = new Map<string, Contact>()
    for (const contact of contacts) {
      map.set(contact.id, contact)
    }
    return map
  }, [contacts])

  return {
    contacts,
    contactsMap,
    loading,
    error,
    addContact,
    updateContact,
    deleteContact,
    searchContacts,
    getContactById,
  }
}
