-- Action Queue: Proposed automated actions awaiting user approval
CREATE TABLE IF NOT EXISTS action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- What kind of action
  action_type TEXT NOT NULL CHECK (action_type IN (
    'send_email',       -- Draft and send an email
    'create_task',      -- Create a new task
    'schedule_meeting', -- Book a calendar event
    'update_contact',   -- Update contact info
    'write_vault_note'  -- Write a note to the vault
  )),

  -- Human-readable summary of what will happen
  summary TEXT NOT NULL,

  -- Full action payload (JSON) — everything needed to execute
  payload JSONB NOT NULL DEFAULT '{}',

  -- What triggered this action
  source TEXT NOT NULL CHECK (source IN ('email', 'meeting', 'transcript', 'ai_chat', 'system')),
  source_ref TEXT, -- Reference to source (email message ID, meeting event ID, etc.)

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),

  -- Context for the user to make a decision
  context JSONB DEFAULT '{}',  -- Additional context shown in the approval UI

  -- Execution tracking
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ  -- Optional: auto-reject after this time
);

-- RLS
ALTER TABLE action_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own actions" ON action_queue
  FOR ALL USING (auth.uid() = user_id);

-- Index for pending actions (what the UI queries)
CREATE INDEX idx_action_queue_pending ON action_queue(user_id, status, created_at DESC)
  WHERE status = 'pending';

-- Updated_at trigger
CREATE TRIGGER update_action_queue_updated_at
  BEFORE UPDATE ON action_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
