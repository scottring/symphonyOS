-- Email action items: family-relevant items extracted from Gmail
CREATE TABLE IF NOT EXISTS email_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Source tracking
  email_message_id text NOT NULL,
  email_subject text,
  email_from text,
  email_date timestamptz,

  -- Extracted content
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('school', 'medical', 'social', 'financial', 'household')),
  urgency text DEFAULT 'normal' CHECK (urgency IN ('urgent', 'normal', 'low')),
  due_date date,
  amount_cents int,

  -- Assignment
  relevant_member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES family_members(id) ON DELETE SET NULL,

  -- State
  status text DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'snoozed', 'done', 'dismissed')),
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, email_message_id, title)
);

-- RLS
ALTER TABLE email_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own email action items"
  ON email_action_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own email action items"
  ON email_action_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all email action items"
  ON email_action_items FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_email_actions_active
  ON email_action_items (user_id, status, due_date);

CREATE INDEX idx_email_actions_dedup
  ON email_action_items (email_message_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_email_action_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_action_items_updated
  BEFORE UPDATE ON email_action_items
  FOR EACH ROW
  EXECUTE FUNCTION update_email_action_items_updated_at();
