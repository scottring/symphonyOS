import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { detectAction, findMatchingContacts } from '@/lib/actionDetector'
import type { ParsedAction, ActionRecipient, Action, DbActionLog } from '@/types/action'
import { dbActionLogToAction } from '@/types/action'
import type { Contact } from '@/types/contact'

interface UseActionsReturn {
  // State
  pendingAction: ParsedAction | null
  isSending: boolean
  isParsing: boolean
  error: string | null

  // Methods
  parseInput: (input: string, contacts: Contact[]) => Promise<ParsedAction | null>
  sendAction: (
    action: ParsedAction,
    finalMessage: string,
    recipient: ActionRecipient,
    subject?: string
  ) => Promise<boolean>
  clearPendingAction: () => void

  // History
  recentActions: Action[]
  fetchActionHistory: () => Promise<void>
}

export function useActions(): UseActionsReturn {
  const [pendingAction, setPendingAction] = useState<ParsedAction | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentActions, setRecentActions] = useState<Action[]>([])

  /**
   * Parse user input to detect and prepare an action
   * Uses client-side detection first, then AI for refinement
   */
  const parseInput = useCallback(async (input: string, contacts: Contact[]): Promise<ParsedAction | null> => {
    setError(null)
    setIsParsing(true)

    try {
      // Step 1: Client-side fast detection
      const detection = detectAction(input)

      if (!detection.isLikelyAction) {
        // Not an action - return null so QuickCapture can create a task
        setIsParsing(false)
        return null
      }

      // Step 2: Find matching contacts client-side
      let possibleRecipients: ActionRecipient[] = []
      if (detection.extractedName && detection.likelyType) {
        const matches = findMatchingContacts(contacts, detection.extractedName, detection.likelyType)
        possibleRecipients = matches.map((c) => ({
          contactId: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
        }))
      }

      // Step 3: Call AI for message generation and refinement
      const { data, error: fnError } = await supabase.functions.invoke('ai-parse-action', {
        body: {
          input,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          })),
          actionType: detection.likelyType,
        },
      })

      if (fnError) {
        console.error('AI parse action error:', fnError)
        setError('Failed to process action')
        setIsParsing(false)
        return null
      }

      const aiResult = data as ParsedAction & { latencyMs?: number }

      // Merge client-side and AI results
      const result: ParsedAction = {
        isAction: aiResult.isAction,
        actionType: aiResult.actionType || detection.likelyType,
        recipient: aiResult.recipient || possibleRecipients[0],
        possibleRecipients: aiResult.possibleRecipients?.length
          ? aiResult.possibleRecipients
          : possibleRecipients.length
            ? possibleRecipients
            : aiResult.recipient
              ? [aiResult.recipient]
              : undefined,
        draftMessage: aiResult.draftMessage,
        subject: aiResult.subject,
        confidence: aiResult.confidence,
        originalInput: input,
        reasoning: aiResult.reasoning,
      }

      if (result.isAction) {
        setPendingAction(result)
      }

      setIsParsing(false)
      return result
    } catch (err) {
      console.error('Parse input error:', err)
      setError(err instanceof Error ? err.message : 'Failed to parse input')
      setIsParsing(false)
      return null
    }
  }, [])

  /**
   * Fetch recent action history
   */
  const fetchActionHistory = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (queryError) {
        console.error('Fetch action history error:', queryError)
        return
      }

      const actions = (data as DbActionLog[]).map(dbActionLogToAction)
      setRecentActions(actions)
    } catch (err) {
      console.error('Fetch action history error:', err)
    }
  }, [])

  /**
   * Send an action (SMS or email)
   */
  const sendAction = useCallback(async (
    action: ParsedAction,
    finalMessage: string,
    recipient: ActionRecipient,
    subject?: string
  ): Promise<boolean> => {
    setError(null)
    setIsSending(true)

    try {
      const functionName = action.actionType === 'sms' ? 'send-sms' : 'send-email'

      const body: Record<string, unknown> = {
        to: action.actionType === 'sms' ? recipient.phone : recipient.email,
        message: finalMessage,
        recipientName: recipient.name,
        recipientContactId: recipient.contactId,
        originalInput: action.originalInput,
        aiDraft: action.draftMessage,
        aiConfidence: action.confidence,
      }

      if (action.actionType === 'email') {
        body.subject = subject || 'Message from Symphony'
        body.body = finalMessage
      }

      const { data, error: fnError } = await supabase.functions.invoke(functionName, { body })

      if (fnError) {
        console.error(`${functionName} error:`, fnError)
        setError(fnError.message || `Failed to send ${action.actionType}`)
        setIsSending(false)
        return false
      }

      if (!data?.success) {
        setError(data?.error || `Failed to send ${action.actionType}`)
        setIsSending(false)
        return false
      }

      // Success - clear pending action
      setPendingAction(null)
      setIsSending(false)

      // Refresh action history
      fetchActionHistory()

      return true
    } catch (err) {
      console.error('Send action error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send')
      setIsSending(false)
      return false
    }
  }, [fetchActionHistory])

  /**
   * Clear pending action
   */
  const clearPendingAction = useCallback(() => {
    setPendingAction(null)
    setError(null)
  }, [])

  return {
    pendingAction,
    isSending,
    isParsing,
    error,
    parseInput,
    sendAction,
    clearPendingAction,
    recentActions,
    fetchActionHistory,
  }
}
