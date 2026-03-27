import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchContactMessages,
  sendMessage,
  checkMessagesStatus,
  type IMessage,
  type IMessageStatus,
} from '@/lib/openBrain'

/**
 * Hook to fetch and manage iMessage history for a specific contact.
 * Requires Open Brain running on Mac Mini with Full Disk Access.
 */
export function useMessages(phoneOrEmail: string | undefined | null) {
  const [messages, setMessages] = useState<IMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)
  const lastIdentifier = useRef<string | null>(null)

  // Check availability once
  useEffect(() => {
    let cancelled = false
    checkMessagesStatus().then((status) => {
      if (!cancelled) setAvailable(status.available)
    })
    return () => { cancelled = true }
  }, [])

  // Fetch messages when contact changes
  useEffect(() => {
    if (!phoneOrEmail || !available) {
      setMessages([])
      lastIdentifier.current = null
      return
    }

    // Don't refetch for same identifier
    if (phoneOrEmail === lastIdentifier.current) return
    lastIdentifier.current = phoneOrEmail

    let cancelled = false
    setLoading(true)

    fetchContactMessages(phoneOrEmail, { limit: 30 }).then((result) => {
      if (cancelled) return
      if (result?.found) {
        setMessages(result.messages)
      } else {
        setMessages([])
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [phoneOrEmail, available])

  // Refresh messages
  const refresh = useCallback(async () => {
    if (!phoneOrEmail) return
    setLoading(true)
    const result = await fetchContactMessages(phoneOrEmail, { limit: 30 })
    if (result?.found) {
      setMessages(result.messages)
    }
    setLoading(false)
  }, [phoneOrEmail])

  // Send a message and refresh the thread
  const send = useCallback(async (text: string) => {
    if (!phoneOrEmail || !text.trim()) return false
    setSending(true)
    const result = await sendMessage(phoneOrEmail, text.trim())
    setSending(false)

    if (result?.sent) {
      // Wait a moment for the message to appear in chat.db, then refresh
      setTimeout(() => refresh(), 1500)
      return true
    }
    return false
  }, [phoneOrEmail, refresh])

  return {
    messages,
    loading,
    available,
    sending,
    send,
    refresh,
  }
}

/**
 * Lightweight hook to just check iMessage availability.
 */
export function useMessagesStatus() {
  const [status, setStatus] = useState<IMessageStatus | null>(null)

  useEffect(() => {
    checkMessagesStatus().then(setStatus)
  }, [])

  return status
}
