import { useState } from 'react'
import type { Contact } from '@/types/contact'

interface ContactCardProps {
  contact: Contact
  onUnlink?: () => void
  onUpdate?: (contactId: string, updates: Partial<Contact>) => void
  onOpenContact?: (contactId: string) => void
}

export function ContactCard({ contact, onUnlink, onUpdate, onOpenContact }: ContactCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const handleCall = () => {
    if (contact.phone) {
      window.location.href = `tel:${contact.phone}`
    }
  }

  const handleText = () => {
    if (contact.phone) {
      window.location.href = `sms:${contact.phone}`
    }
  }

  const handleEdit = () => {
    setEditName(contact.name)
    setEditPhone(contact.phone || '')
    setEditEmail(contact.email || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(contact.id, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
      })
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditName('')
    setEditPhone('')
    setEditEmail('')
  }

  if (isEditing) {
    return (
      <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Phone (optional)</label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="555-123-4567"
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Email (optional)</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!editName.trim()}
              className="flex-1 py-2 px-3 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onOpenContact?.(contact.id)}
          className="w-10 h-10 rounded-full bg-primary-200 flex items-center justify-center text-primary-700 flex-shrink-0 hover:bg-primary-300 transition-colors"
          disabled={!onOpenContact}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={() => onOpenContact?.(contact.id)}
          className="flex-1 min-w-0 text-left"
          disabled={!onOpenContact}
        >
          <div className={`font-medium ${onOpenContact ? 'text-primary-600 hover:underline' : 'text-neutral-800'}`}>{contact.name}</div>
          {contact.phone && (
            <div className="text-sm text-neutral-600">{contact.phone}</div>
          )}
          {contact.email && (
            <div className="text-sm text-neutral-500">{contact.email}</div>
          )}
        </button>
        <div className="flex items-center gap-1">
          {onUpdate && (
            <button
              onClick={handleEdit}
              className="p-1.5 text-neutral-400 hover:text-primary-600 hover:bg-white rounded-lg transition-colors"
              aria-label="Edit contact"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}
          {onUnlink && (
            <button
              onClick={onUnlink}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-white rounded-lg transition-colors"
              aria-label="Unlink contact"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {/* Contact actions */}
      {contact.phone && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-primary-100">
          <button
            onClick={handleCall}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-white text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            Call
          </button>
          <button
            onClick={handleText}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-white text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            Text
          </button>
        </div>
      )}
    </div>
  )
}
