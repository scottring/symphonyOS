-- Daily briefs table for AI-generated morning briefings
-- Stores personalized daily summaries with actionable items

CREATE TABLE daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Brief content
  greeting text NOT NULL,
  summary text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]',

  -- Metadata
  generated_at timestamptz DEFAULT now() NOT NULL,
  viewed_at timestamptz,
  dismissed_at timestamptz,

  -- One brief per user per day
  brief_date date NOT NULL DEFAULT current_date,

  CONSTRAINT unique_user_brief_per_day UNIQUE (user_id, brief_date)
);

-- Indexes
CREATE INDEX daily_briefs_user_id_idx ON daily_briefs(user_id);
CREATE INDEX daily_briefs_date_idx ON daily_briefs(brief_date DESC);
CREATE INDEX daily_briefs_user_date_idx ON daily_briefs(user_id, brief_date DESC);

-- Enable RLS
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own briefs"
  ON daily_briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own briefs"
  ON daily_briefs FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert briefs (for edge function)
CREATE POLICY "Service can insert briefs"
  ON daily_briefs FOR INSERT
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE daily_briefs IS 'AI-generated daily briefings with personalized summaries and actionable items';
COMMENT ON COLUMN daily_briefs.greeting IS 'Personalized greeting from the Life COO';
COMMENT ON COLUMN daily_briefs.summary IS 'Brief summary of the day ahead';
COMMENT ON COLUMN daily_briefs.items IS 'JSON array of DailyBriefItem objects with actionable items';
