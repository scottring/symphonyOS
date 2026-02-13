-- Assessment Actions: tracks domain assessment findings that can become Symphony items
-- Part of the Living Assessment Engine — actions flow from assessment conversations
-- into tasks, routines, projects, and goals with bidirectional linking.

-- ============================================================================
-- ASSESSMENT ACTIONS TABLE
-- ============================================================================

CREATE TABLE assessment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Which domain produced this action
  domain_id TEXT NOT NULL,

  -- Action details
  title TEXT NOT NULL,
  description TEXT,
  effort TEXT CHECK (effort IN ('quick_win', 'small', 'medium', 'large', 'ongoing')),
  estimated_time TEXT,

  -- What kind of Symphony item this should become
  action_type TEXT NOT NULL CHECK (action_type IN ('task', 'routine', 'project', 'goal')),
  priority TEXT NOT NULL DEFAULT 'soon' CHECK (priority IN ('now', 'soon', 'later')),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'dismissed', 'in_progress', 'completed')),

  -- Bidirectional link to Symphony items (set when action is pushed to Symphony)
  symphony_item_id UUID,
  symphony_item_type TEXT CHECK (symphony_item_type IN ('task', 'routine', 'project', 'goal')),

  -- Which conversation generated this action
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_assessment_actions_household ON assessment_actions(household_id);
CREATE INDEX idx_assessment_actions_user ON assessment_actions(user_id);
CREATE INDEX idx_assessment_actions_domain ON assessment_actions(household_id, domain_id);
CREATE INDEX idx_assessment_actions_status ON assessment_actions(household_id, status);
CREATE INDEX idx_assessment_actions_symphony ON assessment_actions(symphony_item_id)
  WHERE symphony_item_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE assessment_actions ENABLE ROW LEVEL SECURITY;

-- Household sharing pattern: members can see actions from their household
CREATE POLICY "Users can view household assessment actions"
  ON assessment_actions FOR SELECT
  USING (
    auth.uid() = user_id
    OR users_share_household(auth.uid(), user_id)
  );

CREATE POLICY "Users can create own assessment actions"
  ON assessment_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update household assessment actions"
  ON assessment_actions FOR UPDATE
  USING (
    auth.uid() = user_id
    OR users_share_household(auth.uid(), user_id)
  );

CREATE POLICY "Users can delete own assessment actions"
  ON assessment_actions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE TRIGGER assessment_actions_updated_at
  BEFORE UPDATE ON assessment_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
