-- Track processed Gmail emails to prevent duplicate task creation
CREATE TABLE gmail_processed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed BOOLEAN DEFAULT FALSE,
  email_subject TEXT,
  email_from TEXT,
  UNIQUE(user_id, gmail_message_id)
);

-- Index for efficient lookups
CREATE INDEX idx_gmail_processed_user ON gmail_processed_emails(user_id);
CREATE INDEX idx_gmail_processed_message ON gmail_processed_emails(gmail_message_id);

-- RLS policies
ALTER TABLE gmail_processed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own processed emails"
  ON gmail_processed_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own processed emails"
  ON gmail_processed_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own processed emails"
  ON gmail_processed_emails FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own processed emails"
  ON gmail_processed_emails FOR DELETE
  USING (auth.uid() = user_id);
