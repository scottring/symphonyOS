import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export interface FlaggedEmail {
  gmail_id: string
  thread_id: string
  from: string
  from_email: string
  subject: string
  snippet: string
  received_at: string
  importance: 'high' | 'medium'
  suggested_task_title: string
  reason: string
}

export interface ScanResult {
  emails: FlaggedEmail[]
  summary: string
  total_scanned: number
}

export interface UseGmailScanReturn {
  isScanning: boolean
  scanResult: ScanResult | null
  error: string | null
  needsReconnect: boolean
  scanEmails: () => Promise<ScanResult | null>
  createTaskFromEmail: (email: FlaggedEmail, customTitle?: string) => Promise<string | null>
  dismissEmail: (email: FlaggedEmail) => Promise<void>
  clearResults: () => void
}

export function useGmailScan(): UseGmailScanReturn {
  const { user } = useAuth()
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsReconnect, setNeedsReconnect] = useState(false)

  const scanEmails = useCallback(async (): Promise<ScanResult | null> => {
    if (!user) {
      setError('Not authenticated')
      return null
    }

    setIsScanning(true)
    setError(null)
    setNeedsReconnect(false)

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('google-gmail-scan')

      // Check for needsReconnect in both data and error scenarios
      if (data?.needsReconnect) {
        setNeedsReconnect(true)
        setError(data.error || 'Gmail access not granted. Please reconnect Google.')
        return null
      }

      if (fetchError) {
        // Try to get the response body from the error context
        // Supabase FunctionsHttpError includes the response context
        let errorData: { needsReconnect?: boolean; apiNotEnabled?: boolean; error?: string } | null = null
        try {
          // FunctionsHttpError has a context property with the Response
          if ('context' in fetchError && fetchError.context instanceof Response) {
            errorData = await fetchError.context.json()
          }
        } catch {
          // Ignore JSON parse errors
        }

        if (errorData?.needsReconnect || errorData?.apiNotEnabled) {
          if (errorData.apiNotEnabled) {
            setError(errorData.error || 'Gmail API not enabled in Google Cloud Console.')
          } else {
            setNeedsReconnect(true)
            setError(errorData.error || 'Gmail access not granted. Please reconnect Google.')
          }
          return null
        }

        // Check if the error message indicates a permission issue
        const errMsg = fetchError.message?.toLowerCase() || ''
        if (errMsg.includes('403') || errMsg.includes('permission') || errMsg.includes('gmail')) {
          setNeedsReconnect(true)
          setError('Gmail access not granted. Go to myaccount.google.com/connections, remove Symphony, then reconnect.')
          return null
        }
        throw fetchError
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      const result: ScanResult = {
        emails: data.emails || [],
        summary: data.summary || '',
        total_scanned: data.total_scanned || 0,
      }

      setScanResult(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan emails'
      setError(message)
      return null
    } finally {
      setIsScanning(false)
    }
  }, [user])

  const createTaskFromEmail = useCallback(async (
    email: FlaggedEmail,
    customTitle?: string
  ): Promise<string | null> => {
    if (!user) return null

    const title = customTitle || email.suggested_task_title

    try {
      // Create the task (in inbox, no scheduled date)
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title,
          completed: false,
          notes: `From: ${email.from} <${email.from_email}>\nSubject: ${email.subject}\n\n${email.snippet}`,
        })
        .select('id')
        .single()

      if (taskError) throw taskError

      // Record the email as processed
      const { error: recordError } = await supabase
        .from('gmail_processed_emails')
        .insert({
          user_id: user.id,
          gmail_message_id: email.gmail_id,
          gmail_thread_id: email.thread_id,
          task_id: task.id,
          email_subject: email.subject,
          email_from: email.from_email,
        })

      if (recordError) {
        console.error('Failed to record processed email:', recordError)
        // Don't throw - task was created successfully
      }

      // Remove from scan results
      setScanResult(prev => {
        if (!prev) return null
        return {
          ...prev,
          emails: prev.emails.filter(e => e.gmail_id !== email.gmail_id),
        }
      })

      return task.id
    } catch (err) {
      console.error('Failed to create task from email:', err)
      return null
    }
  }, [user])

  const dismissEmail = useCallback(async (email: FlaggedEmail): Promise<void> => {
    if (!user) return

    try {
      // Record as dismissed (no task created)
      const { error: recordError } = await supabase
        .from('gmail_processed_emails')
        .insert({
          user_id: user.id,
          gmail_message_id: email.gmail_id,
          gmail_thread_id: email.thread_id,
          dismissed: true,
          email_subject: email.subject,
          email_from: email.from_email,
        })

      if (recordError) {
        console.error('Failed to record dismissed email:', recordError)
      }

      // Remove from scan results
      setScanResult(prev => {
        if (!prev) return null
        return {
          ...prev,
          emails: prev.emails.filter(e => e.gmail_id !== email.gmail_id),
        }
      })
    } catch (err) {
      console.error('Failed to dismiss email:', err)
    }
  }, [user])

  const clearResults = useCallback(() => {
    setScanResult(null)
    setError(null)
  }, [])

  return {
    isScanning,
    scanResult,
    error,
    needsReconnect,
    scanEmails,
    createTaskFromEmail,
    dismissEmail,
    clearResults,
  }
}
