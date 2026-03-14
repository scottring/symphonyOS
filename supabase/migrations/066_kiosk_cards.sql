-- Kiosk agent cards: proactive insights surfaced from tasks/projects
CREATE TABLE IF NOT EXISTS kiosk_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_type text NOT NULL,            -- 'flight_deal', 'weather_destination', 'business_hours', etc.
  title text NOT NULL,                -- headline: "SFO flights from $189 RT"
  subtitle text,                      -- supporting detail
  body jsonb DEFAULT '{}',            -- structured payload (prices, links, etc.)
  source_task_id uuid,                -- task that triggered this card
  source_project_id uuid,             -- project that triggered this card
  icon text,                          -- emoji or icon identifier
  priority int DEFAULT 0,             -- higher = more prominent
  expires_at timestamptz,             -- auto-expire stale cards
  dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE kiosk_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kiosk cards"
  ON kiosk_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own kiosk cards"
  ON kiosk_cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all kiosk cards"
  ON kiosk_cards FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for efficient polling
CREATE INDEX idx_kiosk_cards_user_active
  ON kiosk_cards (user_id, dismissed, expires_at);
