-- Action logs for AI-powered SMS and email execution tracking
-- Stores history of all actions sent through Symphony's AI agent

CREATE TABLE action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Action type and status
  action_type text NOT NULL CHECK (action_type IN ('sms', 'email')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'sent', 'failed')),

  -- Recipient info (may or may not link to a contact)
  recipient_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_phone text,           -- E.164 format for SMS
  recipient_email text,           -- For email actions

  -- Message content
  original_input text NOT NULL,   -- What user typed: "text frank about leak"
  ai_draft text,                  -- What AI generated
  final_message text NOT NULL,    -- What was actually sent (may be edited)
  subject text,                   -- For emails only

  -- Execution details
  sent_at timestamptz,
  error text,                     -- Error message if failed

  -- External references for debugging/tracking
  twilio_sid text,                -- Twilio message SID
  resend_id text,                 -- Resend message ID

  -- AI metadata
  ai_confidence numeric(3,2),     -- 0.00-1.00
  ai_model text,                  -- e.g., 'claude-3-5-haiku-20241022'
  ai_latency_ms integer,          -- How long AI took

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX action_logs_user_id_idx ON action_logs(user_id);
CREATE INDEX action_logs_user_status_idx ON action_logs(user_id, status);
CREATE INDEX action_logs_user_created_idx ON action_logs(user_id, created_at DESC);
CREATE INDEX action_logs_recipient_contact_idx ON action_logs(recipient_contact_id);

-- RLS
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own action logs"
  ON action_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own action logs"
  ON action_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own action logs"
  ON action_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- Updated_at trigger (reuse existing function)
CREATE TRIGGER update_action_logs_updated_at
  BEFORE UPDATE ON action_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE action_logs IS 'Tracks SMS and email actions sent through Symphony AI agent';
COMMENT ON COLUMN action_logs.original_input IS 'Raw user input, e.g., "text frank about the leak"';
COMMENT ON COLUMN action_logs.ai_draft IS 'AI-generated message before user edits';
COMMENT ON COLUMN action_logs.final_message IS 'Actual message sent (may be edited by user)';
COMMENT ON COLUMN action_logs.ai_confidence IS 'AI confidence score 0.00-1.00 for action detection';
