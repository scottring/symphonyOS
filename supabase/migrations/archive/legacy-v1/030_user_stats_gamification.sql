-- System Health Gamification: User Stats & Health Snapshots
-- Tracks streaks, achievements, and health history for the gamification feature

-- ============================================================================
-- USER STATS TABLE
-- Tracks per-user gamification metrics including streaks and achievements
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Inbox Zero Streak
  inbox_zero_streak INTEGER DEFAULT 0,
  last_inbox_zero_date DATE,
  longest_inbox_zero_streak INTEGER DEFAULT 0,

  -- Weekly Review Streak
  weekly_review_streak INTEGER DEFAULT 0,
  last_weekly_review_date DATE,
  longest_weekly_review_streak INTEGER DEFAULT 0,

  -- Activity metrics
  total_tasks_processed INTEGER DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,

  -- Achievements (stored as JSON array of achievement IDs with unlock timestamps)
  achievements JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);

-- ============================================================================
-- HEALTH SNAPSHOTS TABLE
-- Stores daily health score snapshots for trend analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Snapshot date (one per day per user)
  snapshot_date DATE NOT NULL,

  -- Health metrics at time of snapshot
  health_score INTEGER NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  inbox_count INTEGER NOT NULL DEFAULT 0,
  scheduled_count INTEGER NOT NULL DEFAULT 0,
  deferred_count INTEGER NOT NULL DEFAULT 0,
  someday_count INTEGER NOT NULL DEFAULT 0,
  aging_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,

  -- Was inbox zero achieved this day?
  inbox_zero_achieved BOOLEAN DEFAULT false,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One snapshot per user per day
  UNIQUE(user_id, snapshot_date)
);

-- Index for querying user's history
CREATE INDEX IF NOT EXISTS idx_health_snapshots_user_date
  ON health_snapshots(user_id, snapshot_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;

-- User stats: users can only see/modify their own stats
CREATE POLICY "Users can view own stats" ON user_stats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats" ON user_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats" ON user_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- Health snapshots: users can only see/modify their own snapshots
CREATE POLICY "Users can view own snapshots" ON health_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots" ON health_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER: Auto-update updated_at on user_stats
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_stats_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_timestamp();

-- ============================================================================
-- HELPER FUNCTION: Get or create user stats record
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_user_stats(p_user_id UUID)
RETURNS user_stats AS $$
DECLARE
  result user_stats;
BEGIN
  -- Try to get existing record
  SELECT * INTO result FROM user_stats WHERE user_id = p_user_id;

  -- Create if not exists
  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id)
    VALUES (p_user_id)
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
