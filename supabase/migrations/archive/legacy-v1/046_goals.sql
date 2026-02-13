-- Goals System Migration
-- Creates goal_areas, goals, and goal_actions tables
-- Adds strategic planning layer above projects/tasks

-- ============================================================================
-- GOAL AREAS: User-defined life areas for organizing goals
-- Examples: "Family & Relationships", "Home", "Career", "Health"
-- ============================================================================
CREATE TABLE goal_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_goal_areas_user_id ON goal_areas(user_id);

ALTER TABLE goal_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own goal areas"
  ON goal_areas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goal areas"
  ON goal_areas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goal areas"
  ON goal_areas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goal areas"
  ON goal_areas FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- GOALS: Annual goals organized by area
-- ============================================================================
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  area_id UUID REFERENCES goal_areas(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_area_id ON goals(area_id);
CREATE INDEX idx_goals_user_year ON goals(user_id, year);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own goals"
  ON goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
  ON goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals"
  ON goals FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GOAL ACTIONS: Quarterly actions under each goal
-- ============================================================================
CREATE TABLE goal_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quarter TEXT NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_goal_actions_goal_id ON goal_actions(goal_id);
CREATE INDEX idx_goal_actions_quarter ON goal_actions(goal_id, quarter);

ALTER TABLE goal_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read actions for their goals"
  ON goal_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM goals WHERE goals.id = goal_actions.goal_id AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert actions for their goals"
  ON goal_actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals WHERE goals.id = goal_actions.goal_id AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update actions for their goals"
  ON goal_actions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM goals WHERE goals.id = goal_actions.goal_id AND goals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete actions for their goals"
  ON goal_actions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM goals WHERE goals.id = goal_actions.goal_id AND goals.user_id = auth.uid()
    )
  );
