import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface EmailThread {
  threadId: string
  subject: string
  snippet: string
  lastMessageDate: string
  from: string
  messageCount: number
}

export interface EmailThreadMessage {
  from: string
  to: string
  date: string
  body: string
}

export interface EmailThreadDetail extends EmailThread {
  messages: EmailThreadMessage[]
}

export function useEventEmails() {
  const [threads, setThreads] = useState<EmailThread[]>([])
  const [selectedThread, setSelectedThread] = useState<EmailThreadDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cache by sorted attendee email set to avoid redundant fetches
  const cacheRef = useRef<Map<string, EmailThread[]>>(new Map())

  const fetchThreadsForEvent = useCallback(async (attendeeEmails: string[]) => {
    if (attendeeEmails.length === 0) {
      setThreads([])
      return
    }

    // Build cache key from sorted emails
    const cacheKey = [...attendeeEmails].sort().join(',')
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setThreads(cached)
      return
    }

    setLoading(true)
    setError(null)
    setSelectedThread(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Not authenticated')
        return
      }

      const { data, error: fnError } = await supabase.functions.invoke('gmail-event-threads', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { attendeeEmails, maxResults: 5 },
      })

      if (fnError) {
        setError(fnError.message || 'Failed to fetch email threads')
        return
      }

      const result = data as { threads: EmailThread[]; error?: string }
      if (result.error) {
        setError(result.error)
        return
      }

      const fetchedThreads = result.threads || []
      cacheRef.current.set(cacheKey, fetchedThreads)
      setThreads(fetchedThreads)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchThreadDetail = useCallback(async (threadId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Not authenticated')
        return
      }

      const { data, error: fnError } = await supabase.functions.invoke('gmail-event-threads', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { threadId },
      })

      if (fnError) {
        setError(fnError.message || 'Failed to fetch thread detail')
        return
      }

      const result = data as { thread: EmailThreadDetail; error?: string }
      if (result.error) {
        setError(result.error)
        return
      }

      setSelectedThread(result.thread)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const sendReply = useCallback(async (
    threadId: string,
    to: string,
    subject: string,
    body: string
  ) => {
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Not authenticated')
        return false
      }

      const { data, error: fnError } = await supabase.functions.invoke('gmail-send', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { to, subject, body, threadId },
      })

      if (fnError) {
        setError(fnError.message || 'Failed to send reply')
        return false
      }

      const result = data as { success?: boolean; error?: string }
      if (result.error) {
        setError(result.error)
        return false
      }

      // Refresh the thread detail to show the sent message
      await fetchThreadDetail(threadId)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }, [fetchThreadDetail])

  const clearSelectedThread = useCallback(() => {
    setSelectedThread(null)
  }, [])

  return {
    threads,
    selectedThread,
    loading,
    error,
    fetchThreadsForEvent,
    fetchThreadDetail,
    sendReply,
    clearSelectedThread,
  }
}
