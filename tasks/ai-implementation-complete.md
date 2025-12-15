# Symphony OS AI Implementation Guide

## Complete Instructions for Claude Code

This document provides complete, step-by-step instructions for implementing the AI assistant system in Symphony OS. Follow these phases in order.

---

# Prerequisites

## External Services Required

Before starting implementation, set up these services:

### 1. Anthropic (Claude API)
- Sign up at https://console.anthropic.com
- Create API key
- Note: Claude Haiku for parsing (~$0.001/call), Sonnet for coaching (~$0.01/call)

### 2. Twilio (SMS)
- Sign up at https://www.twilio.com/try-twilio (free trial = $15 credit)
- Verify your phone number
- Get: Account SID, Auth Token, Phone Number
- Note: ~$0.008/SMS, trial only sends to verified numbers

### 3. Resend (Email)
- Already configured in codebase
- If not: https://resend.com (100 free emails/day)

### 4. Add Secrets to Supabase
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxxx
supabase secrets set TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set FROM_EMAIL=you@yourdomain.com
```

---

# Codebase Context

## Key Files to Understand

Before implementing, read these files to understand existing patterns:

| File | Purpose | Key Patterns |
|------|---------|--------------|
| `src/hooks/useSupabaseTasks.ts` | Task CRUD | Optimistic updates, rollback on error |
| `src/hooks/useContacts.ts` | Contact management | Already has phone field |
| `src/hooks/useAuth.ts` | Auth state | User context pattern |
| `src/components/layout/QuickCapture.tsx` | Input capture | Parsing, rich mode |
| `src/components/toast/Toast.tsx` | Notifications | useToast hook |
| `src/lib/supabase.ts` | Supabase client | Client initialization |
| `supabase/functions/google-calendar-events/index.ts` | Edge function | CORS, auth, error patterns |

## Existing Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Contacts with phone | ✓ Ready | `contacts.phone` field exists |
| Task management | ✓ Ready | Full CRUD with optimistic updates |
| Toast notifications | ✓ Ready | `useToast()` hook |
| Modal system | ✓ Ready | `useModal()` and `useModalWithData()` |
| Edge functions | ✓ Ready | Pattern established |
| RLS policies | ✓ Ready | Household sharing supported |

---

# Phase 2: Action Execution System

## Overview

Enable users to type "text frank about the leak" → AI parses → Preview modal → Send SMS.

## Step 2.1: Create Action Types

**Create file:** `src/types/action.ts`

```typescript
export type ActionType = 'sms' | 'email'
export type ActionStatus = 'draft' | 'confirmed' | 'sent' | 'failed' | 'cancelled'

export interface ActionRecipient {
  contactId?: string
  name: string
  phone?: string
  email?: string
}

export interface ParsedAction {
  isAction: boolean
  actionType?: ActionType
  recipient?: ActionRecipient
  draftMessage?: string
  confidence: number // 0-1, threshold at 0.7
  originalInput: string
  possibleRecipients?: ActionRecipient[] // For disambiguation
}

export interface Action {
  id: string
  userId: string
  type: ActionType
  recipient: ActionRecipient
  message: string
  status: ActionStatus
  createdAt: Date
  sentAt?: Date
  externalId?: string // Twilio SID or Resend ID
  error?: string
}

export interface ActionState {
  pendingAction: ParsedAction | null
  isSending: boolean
  error: string | null
}
```

---

## Step 2.2: Create Database Migration

**Create file:** `supabase/migrations/039_action_logs.sql`

```sql
-- Action logs table for AI action tracking
create table action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  household_id uuid references households(id) on delete cascade,

  -- Action details
  action_type text not null check (action_type in ('sms', 'email')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'sent', 'failed', 'cancelled')),

  -- Recipient info
  recipient_contact_id uuid references contacts(id) on delete set null,
  recipient_name text not null,
  recipient_phone text,
  recipient_email text,

  -- Message content
  message text not null,
  original_input text not null,

  -- External service reference
  external_id text, -- Twilio SID or Resend message ID

  -- Error tracking
  error_message text,

  -- Timestamps
  created_at timestamptz default now() not null,
  sent_at timestamptz,

  -- Constraints
  constraint valid_recipient check (
    (action_type = 'sms' and recipient_phone is not null) or
    (action_type = 'email' and recipient_email is not null)
  )
);

-- Indexes
create index action_logs_user_id_idx on action_logs(user_id);
create index action_logs_status_idx on action_logs(status);
create index action_logs_created_at_idx on action_logs(created_at desc);
create index action_logs_recipient_contact_id_idx on action_logs(recipient_contact_id);

-- Enable RLS
alter table action_logs enable row level security;

-- RLS Policies (match existing pattern)
create policy "Users can view own action logs"
  on action_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own action logs"
  on action_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own action logs"
  on action_logs for update
  using (auth.uid() = user_id);

-- Household members can view shared action logs
create policy "Household members can view shared action logs"
  on action_logs for select
  using (
    household_id is not null and
    exists (
      select 1 from family_members
      where family_members.household_id = action_logs.household_id
      and family_members.user_id = auth.uid()
    )
  );
```

**Run migration:**
```bash
npx supabase db push
```

---

## Step 2.3: Create AI Parse Action Edge Function

**Create directory and file:** `supabase/functions/ai-parse-action/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
}

interface ParseRequest {
  input: string
  contacts: Contact[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify auth header exists
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { input, contacts } = await req.json() as ParseRequest

    if (!input || typeof input !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build contacts context for the prompt
    const contactsList = contacts
      .filter(c => c.phone || c.email)
      .map(c => `- ${c.name} (id: ${c.id})${c.phone ? ` phone: ${c.phone}` : ''}${c.email ? ` email: ${c.email}` : ''}`)
      .join('\n')

    const systemPrompt = `You are an AI assistant that detects actionable requests from user input.

Your job is to determine if the user wants to send a text message (SMS) or email to someone.

Action patterns to detect:
- "text [name] about [topic]" → SMS
- "message [name] [content]" → SMS
- "send [name] a text about [topic]" → SMS
- "email [name] about [topic]" → Email
- "send an email to [name] about [topic]" → Email

User's contacts:
${contactsList || '(No contacts with phone/email)'}

Respond with JSON only, no markdown:
{
  "isAction": boolean,
  "actionType": "sms" | "email" | null,
  "recipientName": string | null,
  "recipientContactId": string | null,
  "draftMessage": string | null,
  "confidence": number (0-1),
  "possibleMatches": [{ "name": string, "contactId": string }] | null
}

Rules:
1. Only set isAction=true if you're confident the user wants to send a message
2. If multiple contacts match the name, list them in possibleMatches
3. Draft a natural, friendly message based on the topic mentioned
4. confidence should be 0.9+ for clear action requests, 0.7-0.9 for likely, <0.7 for uncertain
5. If the mentioned name is not in contacts, still set isAction=true but recipientContactId=null
6. If no action detected, return isAction=false with confidence=1.0`

    // Call Claude API
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [
          { role: 'user', content: `User input: "${input}"` }
        ],
        system: systemPrompt,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', errorText)
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const aiResponse = await response.json()
    const content = aiResponse.content[0]?.text

    if (!content) {
      throw new Error('No response from AI')
    }

    // Parse AI response
    let parsed: any
    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim()
      parsed = JSON.parse(jsonStr)
    } catch (e) {
      console.error('Failed to parse AI response:', content)
      throw new Error('Invalid AI response format')
    }

    // Build result with contact enrichment
    const result: any = {
      isAction: parsed.isAction ?? false,
      confidence: parsed.confidence ?? 0,
      originalInput: input,
    }

    if (parsed.isAction && parsed.actionType) {
      result.actionType = parsed.actionType

      // Find matching contact(s)
      if (parsed.recipientContactId) {
        const contact = contacts.find(c => c.id === parsed.recipientContactId)
        if (contact) {
          result.recipient = {
            contactId: contact.id,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
          }
        }
      } else if (parsed.recipientName) {
        // Try to match by name
        const matchingContacts = contacts.filter(c =>
          c.name.toLowerCase().includes(parsed.recipientName.toLowerCase())
        )

        if (matchingContacts.length === 1) {
          const contact = matchingContacts[0]
          result.recipient = {
            contactId: contact.id,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
          }
        } else if (matchingContacts.length > 1) {
          result.possibleRecipients = matchingContacts.map(c => ({
            contactId: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          }))
        } else {
          // No match - use the name from AI
          result.recipient = { name: parsed.recipientName }
        }
      }

      result.draftMessage = parsed.draftMessage

      // Validate recipient has required info for action type
      if (result.recipient) {
        if (result.actionType === 'sms' && !result.recipient.phone) {
          result.isAction = false
          result.error = `No phone number found for ${result.recipient.name}`
        } else if (result.actionType === 'email' && !result.recipient.email) {
          result.isAction = false
          result.error = `No email found for ${result.recipient.name}`
        }
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in ai-parse-action:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## Step 2.4: Create Send SMS Edge Function

**Create directory and file:** `supabase/functions/send-sms/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendSmsRequest {
  actionLogId: string
  to: string
  message: string
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '')
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = '+' + cleaned
    } else if (cleaned.length === 10) {
      cleaned = '+1' + cleaned
    }
  }
  return cleaned
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { actionLogId, to, message } = await req.json() as SendSmsRequest

    // Validate phone number
    const normalizedPhone = normalizePhone(to)
    const phoneRegex = /^\+[1-9]\d{1,14}$/
    if (!phoneRegex.test(normalizedPhone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate message
    if (!message || message.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (message.length > 1600) {
      return new Response(
        JSON.stringify({ error: 'Message too long (max 1600 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured')
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`)

    const formData = new URLSearchParams()
    formData.append('To', normalizedPhone)
    formData.append('From', twilioPhoneNumber)
    formData.append('Body', message)

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${twilioAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const twilioResult = await twilioResponse.json()

    if (!twilioResponse.ok) {
      // Update action log with error
      if (actionLogId) {
        await supabase
          .from('action_logs')
          .update({
            status: 'failed',
            error_message: twilioResult.message || 'Twilio error',
          })
          .eq('id', actionLogId)
          .eq('user_id', user.id)
      }

      return new Response(
        JSON.stringify({ error: twilioResult.message || 'Failed to send SMS' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update action log with success
    if (actionLogId) {
      await supabase
        .from('action_logs')
        .update({
          status: 'sent',
          external_id: twilioResult.sid,
          sent_at: new Date().toISOString(),
        })
        .eq('id', actionLogId)
        .eq('user_id', user.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageSid: twilioResult.sid,
        status: twilioResult.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-sms:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## Step 2.5: Create Send Email Edge Function

**Create directory and file:** `supabase/functions/send-email/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendEmailRequest {
  actionLogId: string
  to: string
  toName: string
  subject: string
  message: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { actionLogId, to, toName, subject, message } = await req.json() as SendEmailRequest

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const fromEmail = Deno.env.get('FROM_EMAIL') || 'noreply@symphony.app'
    const fromName = user.user_metadata?.full_name || 'Symphony'

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: toName ? `${toName} <${to}>` : to,
        subject: subject,
        text: message,
      }),
    })

    const resendResult = await resendResponse.json()

    if (!resendResponse.ok) {
      if (actionLogId) {
        await supabase
          .from('action_logs')
          .update({
            status: 'failed',
            error_message: resendResult.message || 'Resend error',
          })
          .eq('id', actionLogId)
          .eq('user_id', user.id)
      }

      return new Response(
        JSON.stringify({ error: resendResult.message || 'Failed to send email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (actionLogId) {
      await supabase
        .from('action_logs')
        .update({
          status: 'sent',
          external_id: resendResult.id,
          sent_at: new Date().toISOString(),
        })
        .eq('id', actionLogId)
        .eq('user_id', user.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: resendResult.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## Step 2.6: Create useActions Hook

**Create file:** `src/hooks/useActions.ts`

```typescript
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useContacts } from '@/hooks/useContacts'
import type { ParsedAction, ActionRecipient } from '@/types/action'

interface UseActionsReturn {
  pendingAction: ParsedAction | null
  isSending: boolean
  error: string | null
  parseInput: (input: string) => Promise<ParsedAction>
  selectRecipient: (recipient: ActionRecipient) => void
  updateMessage: (message: string) => void
  confirmAction: () => Promise<{ success: boolean; error?: string }>
  cancelAction: () => void
  saveAsTask: () => void
}

export function useActions(onSaveAsTask?: (title: string) => void): UseActionsReturn {
  const { user } = useAuth()
  const { contacts } = useContacts()

  const [pendingAction, setPendingAction] = useState<ParsedAction | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseInput = useCallback(async (input: string): Promise<ParsedAction> => {
    setError(null)

    // Quick client-side check - only call AI if input looks like an action
    const actionPatterns = /^(text|message|send|email)\s+/i
    if (!actionPatterns.test(input.trim())) {
      return {
        isAction: false,
        confidence: 1.0,
        originalInput: input,
      }
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Filter contacts to only those with phone or email
      const contactsWithInfo = contacts.filter(c => c.phone || c.email)

      const response = await supabase.functions.invoke('ai-parse-action', {
        body: {
          input,
          contacts: contactsWithInfo.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          })),
        },
      })

      if (response.error) {
        throw new Error(response.error.message)
      }

      const parsed = response.data as ParsedAction

      // Set as pending if confidence is high enough
      if (parsed.isAction && parsed.confidence >= 0.7 && parsed.recipient) {
        setPendingAction(parsed)
      }

      return parsed
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse input'
      setError(message)
      return {
        isAction: false,
        confidence: 0,
        originalInput: input,
      }
    }
  }, [contacts])

  const selectRecipient = useCallback((recipient: ActionRecipient) => {
    if (!pendingAction) return
    setPendingAction({
      ...pendingAction,
      recipient,
      possibleRecipients: undefined,
    })
  }, [pendingAction])

  const updateMessage = useCallback((message: string) => {
    if (!pendingAction) return
    setPendingAction({
      ...pendingAction,
      draftMessage: message,
    })
  }, [pendingAction])

  const confirmAction = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!pendingAction || !pendingAction.recipient || !pendingAction.draftMessage) {
      return { success: false, error: 'Invalid action state' }
    }

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    setIsSending(true)
    setError(null)

    try {
      // Create action log entry first
      const { data: actionLog, error: insertError } = await supabase
        .from('action_logs')
        .insert({
          user_id: user.id,
          action_type: pendingAction.actionType,
          status: 'confirmed',
          recipient_contact_id: pendingAction.recipient.contactId,
          recipient_name: pendingAction.recipient.name,
          recipient_phone: pendingAction.recipient.phone,
          recipient_email: pendingAction.recipient.email,
          message: pendingAction.draftMessage,
          original_input: pendingAction.originalInput,
        })
        .select()
        .single()

      if (insertError) {
        throw new Error('Failed to create action log')
      }

      // Send the message
      if (pendingAction.actionType === 'sms') {
        const { error: sendError } = await supabase.functions.invoke('send-sms', {
          body: {
            actionLogId: actionLog.id,
            to: pendingAction.recipient.phone,
            message: pendingAction.draftMessage,
          },
        })

        if (sendError) {
          throw new Error(sendError.message)
        }
      } else if (pendingAction.actionType === 'email') {
        const subject = pendingAction.draftMessage.split('\n')[0].slice(0, 50) || 'Message from Symphony'

        const { error: sendError } = await supabase.functions.invoke('send-email', {
          body: {
            actionLogId: actionLog.id,
            to: pendingAction.recipient.email,
            toName: pendingAction.recipient.name,
            subject,
            message: pendingAction.draftMessage,
          },
        })

        if (sendError) {
          throw new Error(sendError.message)
        }
      }

      setPendingAction(null)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message'
      setError(message)
      return { success: false, error: message }
    } finally {
      setIsSending(false)
    }
  }, [pendingAction, user])

  const cancelAction = useCallback(() => {
    setPendingAction(null)
    setError(null)
  }, [])

  const saveAsTask = useCallback(() => {
    if (!pendingAction) return
    onSaveAsTask?.(pendingAction.originalInput)
    setPendingAction(null)
  }, [pendingAction, onSaveAsTask])

  return {
    pendingAction,
    isSending,
    error,
    parseInput,
    selectRecipient,
    updateMessage,
    confirmAction,
    cancelAction,
    saveAsTask,
  }
}
```

---

## Step 2.7: Create ActionPreview Component

**Create directory and file:** `src/components/action/ActionPreview.tsx`

```tsx
import { useState, useEffect } from 'react'
import { X, Send, MessageSquare, Mail, AlertTriangle, BookmarkPlus } from 'lucide-react'
import type { ParsedAction, ActionRecipient } from '@/types/action'

interface ActionPreviewProps {
  action: ParsedAction
  isSending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  onSaveAsTask: () => void
  onSelectRecipient: (recipient: ActionRecipient) => void
  onUpdateMessage: (message: string) => void
}

export function ActionPreview({
  action,
  isSending,
  error,
  onConfirm,
  onCancel,
  onSaveAsTask,
  onSelectRecipient,
  onUpdateMessage,
}: ActionPreviewProps) {
  const [message, setMessage] = useState(action.draftMessage || '')

  useEffect(() => {
    setMessage(action.draftMessage || '')
  }, [action.draftMessage])

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value
    setMessage(newMessage)
    onUpdateMessage(newMessage)
  }

  const isDisambiguation = action.possibleRecipients && action.possibleRecipients.length > 1
  const isSms = action.actionType === 'sms'
  const isEmail = action.actionType === 'email'

  const charCount = message.length
  const smsSegments = Math.ceil(charCount / 160)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md bg-bg-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <div className="flex items-center gap-2">
            {isSms && <MessageSquare className="h-5 w-5 text-primary-500" />}
            {isEmail && <Mail className="h-5 w-5 text-primary-500" />}
            <h2 className="font-display text-lg">
              {isDisambiguation
                ? 'Who do you mean?'
                : isSms
                ? `Send Text to ${action.recipient?.name}`
                : `Send Email to ${action.recipient?.name}`}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full p-1 hover:bg-bg-subtle"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Disambiguation */}
          {isDisambiguation && (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                Multiple contacts match. Select one:
              </p>
              <div className="space-y-2">
                {action.possibleRecipients?.map((recipient) => (
                  <button
                    key={recipient.contactId}
                    onClick={() => onSelectRecipient(recipient)}
                    className="w-full text-left p-3 rounded-lg border border-border-subtle hover:bg-bg-subtle transition-colors"
                  >
                    <div className="font-medium">{recipient.name}</div>
                    <div className="text-sm text-text-secondary">
                      {isSms && recipient.phone}
                      {isEmail && recipient.email}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recipient info */}
          {!isDisambiguation && action.recipient && (
            <div>
              <div className="text-sm text-text-secondary">To:</div>
              <div className="font-medium">{action.recipient.name}</div>
              <div className="text-sm text-text-secondary">
                {isSms && action.recipient.phone}
                {isEmail && action.recipient.email}
              </div>
            </div>
          )}

          {/* Message textarea */}
          {!isDisambiguation && (
            <div>
              <textarea
                value={message}
                onChange={handleMessageChange}
                className="input-base w-full min-h-[120px] resize-none"
                placeholder="Type your message..."
                disabled={isSending}
              />
              {isSms && (
                <div className="flex justify-between text-xs text-text-secondary mt-1">
                  <span>{charCount} characters</span>
                  {smsSegments > 1 && (
                    <span className="text-amber-600">
                      {smsSegments} SMS segments
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Warning */}
          {!isDisambiguation && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <AlertTriangle className="h-3 w-3" />
              This will send a real {isSms ? 'SMS' : 'email'}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isDisambiguation && (
          <div className="flex items-center justify-between border-t border-border-subtle p-4">
            <button
              onClick={onSaveAsTask}
              className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              disabled={isSending}
            >
              <BookmarkPlus className="h-4 w-4" />
              Save as Task
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isSending || !message.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {isSending ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Step 2.8: Modify QuickCapture.tsx

**Modify file:** `src/components/layout/QuickCapture.tsx`

Add the `onParseAction` prop and integrate with submit:

```typescript
// Add to props interface (around line 20-40)
interface QuickCaptureProps {
  onAdd: (title: string) => void
  onAddRich?: (data: {
    title: string
    projectId?: string | null
    contactId?: string | null
    scheduledFor?: Date | null
    category?: string | null
  }) => void
  onParseAction?: (input: string) => Promise<{ isAction: boolean; confidence: number }> // ADD THIS
  projects?: Array<{ id: string; name: string }>
  contacts?: Array<{ id: string; name: string }>
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
  showFab?: boolean
}

// Modify the handleSubmit function (around line 100-150)
const handleSubmit = async () => {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) return

  // Check for action first (if handler provided)
  if (onParseAction) {
    const result = await onParseAction(trimmedTitle)
    if (result.isAction && result.confidence >= 0.7) {
      // Action will be handled by parent - don't create task
      setTitle('')
      onClose?.()
      return
    }
  }

  // Continue with existing task creation logic...
  // (keep all existing code below)
}
```

---

## Step 2.9: Integrate in App.tsx

**Modify file:** `src/App.tsx`

Add the action system integration:

```typescript
// Add imports at top
import { useActions } from '@/hooks/useActions'
import { ActionPreview } from '@/components/action/ActionPreview'

// Inside the App component, add the hook (around line 50-100)
function App() {
  // ... existing hooks ...

  // Add this near other hooks
  const {
    pendingAction,
    isSending,
    error: actionError,
    parseInput,
    selectRecipient,
    updateMessage,
    confirmAction,
    cancelAction,
    saveAsTask,
  } = useActions((title) => {
    // Save as task callback - use existing addTask
    addTask({ title })
  })

  // Add handler for confirm
  const handleConfirmAction = async () => {
    const result = await confirmAction()
    if (result.success) {
      showToast('Message sent!', 'success')
    }
  }

  // ... existing code ...

  return (
    <>
      {/* Existing app content */}

      {/* Modify QuickCapture to include onParseAction */}
      <QuickCapture
        onAdd={handleQuickAdd}
        onAddRich={handleQuickAddRich}
        onParseAction={parseInput}  // ADD THIS
        projects={projects}
        contacts={contacts}
      />

      {/* Add ActionPreview Modal */}
      {pendingAction && (
        <ActionPreview
          action={pendingAction}
          isSending={isSending}
          error={actionError}
          onConfirm={handleConfirmAction}
          onCancel={cancelAction}
          onSaveAsTask={saveAsTask}
          onSelectRecipient={selectRecipient}
          onUpdateMessage={updateMessage}
        />
      )}
    </>
  )
}
```

---

## Step 2.10: Deploy Edge Functions

```bash
# Deploy all new functions
supabase functions deploy ai-parse-action
supabase functions deploy send-sms
supabase functions deploy send-email
```

---

## Phase 2 Testing Checklist

1. [ ] Type "text [contact name] about [topic]" in QuickCapture
2. [ ] Verify ActionPreview modal appears with correct recipient
3. [ ] Verify draft message is generated
4. [ ] Edit the message in the textarea
5. [ ] Click "Send" and verify SMS is sent (check Twilio logs)
6. [ ] Check action_logs table for entry with status='sent'
7. [ ] Test "Save as Task" creates inbox task
8. [ ] Test "Cancel" dismisses modal
9. [ ] Test disambiguation when multiple contacts match
10. [ ] Test email action: "email [contact] about [topic]"
11. [ ] Test error handling (invalid phone, missing contact info)
12. [ ] Test non-action inputs still create tasks normally

---

# Phase 3: Proactive AI (Daily Brief)

## Overview

Generate a morning brief that surfaces stale items, conflicts, and items needing attention.

---

## Step 3.1: Create Daily Brief Types

**Add to:** `src/types/action.ts`

```typescript
// Add these types to the existing file

export interface DailyBriefItem {
  id: string
  type: 'stale_followup' | 'conflict' | 'deferred_reminder' | 'upcoming_deadline' | 'inbox_reminder'
  title: string
  description: string
  relatedEntityType?: 'task' | 'contact' | 'event' | 'action_log'
  relatedEntityId?: string
  suggestedActions: Array<{
    label: string
    action: 'follow_up' | 'mark_resolved' | 'snooze' | 'schedule' | 'defer' | 'delete' | 'open'
  }>
  priority: 'high' | 'medium' | 'low'
}

export interface DailyBrief {
  id: string
  userId: string
  briefDate: Date
  greeting: string
  items: DailyBriefItem[]
  generatedAt: Date
  viewedAt?: Date
  dismissedAt?: Date
}
```

---

## Step 3.2: Create Database Migration

**Create file:** `supabase/migrations/040_daily_briefs.sql`

```sql
-- Daily briefs table
create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  -- Brief content
  greeting text not null,
  items jsonb not null default '[]',

  -- Metadata
  generated_at timestamptz default now() not null,
  viewed_at timestamptz,
  dismissed_at timestamptz,

  -- One brief per user per day
  brief_date date not null default current_date,

  constraint unique_user_brief_per_day unique (user_id, brief_date)
);

-- Indexes
create index daily_briefs_user_id_idx on daily_briefs(user_id);
create index daily_briefs_date_idx on daily_briefs(brief_date desc);

-- Enable RLS
alter table daily_briefs enable row level security;

-- RLS Policies
create policy "Users can view own briefs"
  on daily_briefs for select
  using (auth.uid() = user_id);

create policy "Users can update own briefs"
  on daily_briefs for update
  using (auth.uid() = user_id);

create policy "Service can insert briefs"
  on daily_briefs for insert
  with check (true);
```

---

## Step 3.3: Create Context Snapshot Edge Function

**Create directory and file:** `supabase/functions/get-context-snapshot/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch all relevant data in parallel
    const [
      { data: tasks },
      { data: inboxTasks },
      { data: projects },
      { data: contacts },
      { data: recentActions },
      { data: routines },
    ] = await Promise.all([
      // Scheduled tasks for next 7 days
      supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('completed', false)
        .gte('scheduled_for', today)
        .lte('scheduled_for', weekAhead)
        .order('scheduled_for'),

      // Inbox tasks (unscheduled, created more than 3 days ago)
      supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('completed', false)
        .is('scheduled_for', null)
        .lte('created_at', threeDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10),

      // Active projects
      supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active'),

      // Contacts
      supabase
        .from('contacts')
        .select('id, name, phone, email')
        .eq('user_id', user.id),

      // Recent action logs (messages sent)
      supabase
        .from('action_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'sent')
        .gte('sent_at', threeDaysAgo)
        .order('sent_at', { ascending: false }),

      // Active routines
      supabase
        .from('routines')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true),
    ])

    const snapshot = {
      user: {
        id: user.id,
        name: user.user_metadata?.full_name || 'there',
      },
      currentTime: now.toISOString(),
      today,
      tasks: {
        scheduled: tasks || [],
        staleInbox: inboxTasks || [],
      },
      projects: projects || [],
      contacts: contacts || [],
      recentActions: recentActions || [],
      routines: routines || [],
      stats: {
        staleInboxCount: inboxTasks?.length || 0,
        scheduledTodayCount: tasks?.filter(t => t.scheduled_for?.startsWith(today)).length || 0,
        activeProjectsCount: projects?.length || 0,
        unacknowledgedActions: recentActions?.length || 0,
      },
    }

    return new Response(
      JSON.stringify(snapshot),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in get-context-snapshot:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## Step 3.4: Create Generate Daily Brief Edge Function

**Create directory and file:** `supabase/functions/generate-daily-brief/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check for force refresh
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === 'true'

    // Check if brief already exists for today
    const today = new Date().toISOString().split('T')[0]
    const { data: existingBrief } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('user_id', user.id)
      .eq('brief_date', today)
      .single()

    if (existingBrief && !force) {
      return new Response(
        JSON.stringify(existingBrief),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get context snapshot
    const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/get-context-snapshot`, {
      headers: { 'Authorization': authHeader },
    })

    if (!snapshotResponse.ok) {
      throw new Error('Failed to get context snapshot')
    }

    const snapshot = await snapshotResponse.json()

    const systemPrompt = `You are a thoughtful personal assistant generating a morning brief.

Based on the user's context, identify 3-5 items that need attention today. Focus on:
1. Messages sent recently without response (follow-up needed after 2+ days)
2. Tasks sitting in inbox for more than 3 days (need to be triaged)
3. Upcoming deadlines in the next 3 days
4. Patterns worth noting (e.g., "You've rescheduled this 3 times")

Respond with JSON only:
{
  "greeting": "Good morning [name]. [Brief contextual greeting]",
  "items": [
    {
      "type": "stale_followup" | "inbox_reminder" | "upcoming_deadline" | "deferred_reminder",
      "title": "Brief title",
      "description": "1-2 sentence explanation",
      "relatedEntityType": "task" | "contact" | "action_log" | null,
      "relatedEntityId": "uuid or null",
      "suggestedActions": [
        { "label": "Follow up", "action": "follow_up" },
        { "label": "Mark resolved", "action": "mark_resolved" }
      ],
      "priority": "high" | "medium" | "low"
    }
  ]
}

Rules:
- Maximum 5 items, minimum 1 (even if just encouragement)
- Use actual names and details from context
- Keep descriptions concise and actionable
- Prioritize by urgency (high = needs action today)
- Be warm but not overly cheerful`

    const userPrompt = `Context:\n${JSON.stringify(snapshot, null, 2)}`

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      }),
    })

    if (!aiResponse.ok) {
      throw new Error(`Anthropic API error: ${aiResponse.status}`)
    }

    const aiResult = await aiResponse.json()
    const content = aiResult.content[0]?.text

    if (!content) {
      throw new Error('No response from AI')
    }

    let briefData: any
    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim()
      briefData = JSON.parse(jsonStr)
    } catch (e) {
      console.error('Failed to parse AI response:', content)
      throw new Error('Invalid AI response format')
    }

    // Upsert brief
    const { data: brief, error: upsertError } = await supabase
      .from('daily_briefs')
      .upsert({
        user_id: user.id,
        brief_date: today,
        greeting: briefData.greeting,
        items: briefData.items,
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,brief_date',
      })
      .select()
      .single()

    if (upsertError) {
      throw new Error('Failed to save brief')
    }

    return new Response(
      JSON.stringify(brief),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in generate-daily-brief:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## Step 3.5: Create useDailyBrief Hook

**Create file:** `src/hooks/useDailyBrief.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DailyBrief, DailyBriefItem } from '@/types/action'

interface UseDailyBriefReturn {
  brief: DailyBrief | null
  isLoading: boolean
  error: string | null
  refresh: (force?: boolean) => Promise<void>
  dismiss: () => Promise<void>
  markViewed: () => Promise<void>
}

export function useDailyBrief(): UseDailyBriefReturn {
  const { user } = useAuth()
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBrief = useCallback(async (force = false) => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) throw new Error('Not authenticated')

      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-daily-brief`)
      if (force) url.searchParams.set('force', 'true')

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) throw new Error('Failed to fetch brief')

      const data = await response.json()

      setBrief({
        id: data.id,
        userId: data.user_id,
        briefDate: new Date(data.brief_date),
        greeting: data.greeting,
        items: data.items,
        generatedAt: new Date(data.generated_at),
        viewedAt: data.viewed_at ? new Date(data.viewed_at) : undefined,
        dismissedAt: data.dismissed_at ? new Date(data.dismissed_at) : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brief')
    } finally {
      setIsLoading(false)
    }
  }, [user])

  const markViewed = useCallback(async () => {
    if (!brief) return
    await supabase
      .from('daily_briefs')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', brief.id)
  }, [brief])

  const dismiss = useCallback(async () => {
    if (!brief) return
    await supabase
      .from('daily_briefs')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', brief.id)
    setBrief(null)
  }, [brief])

  useEffect(() => {
    if (user) fetchBrief()
  }, [user, fetchBrief])

  return {
    brief,
    isLoading,
    error,
    refresh: fetchBrief,
    dismiss,
    markViewed,
  }
}
```

---

## Step 3.6: Create DailyBrief Component

**Create directory and file:** `src/components/brief/DailyBrief.tsx`

```tsx
import { useEffect } from 'react'
import { X, RefreshCw, AlertCircle, Clock, Calendar, Inbox, MessageSquare } from 'lucide-react'
import { useDailyBrief } from '@/hooks/useDailyBrief'
import type { DailyBriefItem } from '@/types/action'

interface DailyBriefProps {
  onClose?: () => void
  onActionClick?: (item: DailyBriefItem, action: string) => void
}

export function DailyBrief({ onClose, onActionClick }: DailyBriefProps) {
  const { brief, isLoading, error, refresh, dismiss, markViewed } = useDailyBrief()

  useEffect(() => {
    if (brief && !brief.viewedAt) {
      markViewed()
    }
  }, [brief, markViewed])

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center gap-2 text-text-secondary">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Preparing your brief...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <button
          onClick={() => refresh(true)}
          className="mt-2 text-sm text-primary-500 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!brief || brief.dismissedAt) return null

  const getItemIcon = (type: DailyBriefItem['type']) => {
    switch (type) {
      case 'stale_followup': return <MessageSquare className="h-4 w-4 text-amber-500" />
      case 'upcoming_deadline': return <Calendar className="h-4 w-4 text-red-500" />
      case 'deferred_reminder': return <Clock className="h-4 w-4 text-blue-500" />
      case 'inbox_reminder': return <Inbox className="h-4 w-4 text-gray-500" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const getPriorityBorder = (priority: DailyBriefItem['priority']) => {
    switch (priority) {
      case 'high': return 'border-l-red-500'
      case 'medium': return 'border-l-amber-500'
      case 'low': return 'border-l-gray-300'
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between p-4 border-b border-border-subtle">
        <div>
          <h2 className="font-display text-xl">{brief.greeting}</h2>
          <p className="text-sm text-text-secondary mt-1">
            {brief.items.length} {brief.items.length === 1 ? 'item' : 'items'} for your attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh(true)}
            className="p-2 rounded-full hover:bg-bg-subtle"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-text-secondary" />
          </button>
          <button
            onClick={() => { dismiss(); onClose?.() }}
            className="p-2 rounded-full hover:bg-bg-subtle"
            title="Dismiss"
          >
            <X className="h-4 w-4 text-text-secondary" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border-subtle">
        {brief.items.map((item, index) => (
          <div key={index} className={`p-4 border-l-4 ${getPriorityBorder(item.priority)}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getItemIcon(item.type)}</div>
              <div className="flex-1">
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-sm text-text-secondary mt-0.5">{item.description}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {item.suggestedActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => onActionClick?.(item, action.action)}
                      className="px-3 py-1.5 text-sm bg-bg-subtle hover:bg-bg-muted rounded-lg"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Step 3.7: Integrate in HomeView

**Modify:** `src/components/home/HomeView.tsx`

Add the DailyBrief at the top of the view:

```tsx
import { useState, useEffect } from 'react'
import { DailyBrief } from '@/components/brief/DailyBrief'

export function HomeView({ /* existing props */ }) {
  const [showBrief, setShowBrief] = useState(false)

  // Show brief on first load of the day
  useEffect(() => {
    const lastBriefDate = localStorage.getItem('symphony_lastBriefDate')
    const today = new Date().toISOString().split('T')[0]

    if (lastBriefDate !== today) {
      setShowBrief(true)
      localStorage.setItem('symphony_lastBriefDate', today)
    }
  }, [])

  const handleBriefAction = (item: any, action: string) => {
    // Handle actions - navigate to task, send follow-up, etc.
    console.log('Brief action:', action, item)
    // Implement based on action type
  }

  return (
    <div className="space-y-6">
      {/* Daily Brief at top */}
      {showBrief && (
        <DailyBrief
          onClose={() => setShowBrief(false)}
          onActionClick={handleBriefAction}
        />
      )}

      {/* Rest of HomeView content */}
      {/* ... existing code ... */}
    </div>
  )
}
```

---

## Step 3.8: Deploy Phase 3 Functions

```bash
supabase functions deploy get-context-snapshot
supabase functions deploy generate-daily-brief
```

---

## Phase 3 Testing Checklist

1. [ ] Daily brief generates on first app open of the day
2. [ ] Brief shows personalized greeting with user's name
3. [ ] Brief identifies stale inbox items (>3 days old)
4. [ ] Brief identifies recent messages needing follow-up
5. [ ] Refresh button regenerates brief
6. [ ] Dismiss button hides brief
7. [ ] Brief doesn't auto-show again after dismissal (same day)
8. [ ] Brief shows again the next day
9. [ ] Action buttons are clickable (even if not fully wired up)

---

# Summary of All Files

## New Files Created

### Phase 2
| File | Purpose |
|------|---------|
| `src/types/action.ts` | Action and brief type definitions |
| `supabase/migrations/039_action_logs.sql` | Action logging table |
| `supabase/functions/ai-parse-action/index.ts` | AI parsing edge function |
| `supabase/functions/send-sms/index.ts` | Twilio SMS sending |
| `supabase/functions/send-email/index.ts` | Resend email sending |
| `src/hooks/useActions.ts` | Action state management |
| `src/components/action/ActionPreview.tsx` | Action preview modal |

### Phase 3
| File | Purpose |
|------|---------|
| `supabase/migrations/040_daily_briefs.sql` | Daily briefs table |
| `supabase/functions/get-context-snapshot/index.ts` | Context aggregation |
| `supabase/functions/generate-daily-brief/index.ts` | Brief generation |
| `src/hooks/useDailyBrief.ts` | Brief state management |
| `src/components/brief/DailyBrief.tsx` | Brief display component |

## Files Modified

| File | Changes |
|------|---------|
| `src/components/layout/QuickCapture.tsx` | Add `onParseAction` prop |
| `src/App.tsx` | Wire up `useActions` and `ActionPreview` |
| `src/components/home/HomeView.tsx` | Add `DailyBrief` component |

---

# Deployment Commands

```bash
# Run database migrations
npx supabase db push

# Set secrets (do this once)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxxx
supabase secrets set TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set FROM_EMAIL=you@yourdomain.com

# Deploy edge functions
supabase functions deploy ai-parse-action
supabase functions deploy send-sms
supabase functions deploy send-email
supabase functions deploy get-context-snapshot
supabase functions deploy generate-daily-brief

# Start dev server
npm run dev
```

---

# Cost Estimate

| Component | Cost per Use |
|-----------|--------------|
| Claude Haiku (action parsing) | ~$0.001 |
| Claude Haiku (daily brief) | ~$0.003 |
| Twilio SMS | ~$0.008 |
| Resend Email | Free (100/day) |

**Monthly estimate (moderate use):** $5-15
