-- Add context column to goals for domain filtering (work/family/personal)
ALTER TABLE goals ADD COLUMN context TEXT CHECK (context IN ('work', 'family', 'personal'));
CREATE INDEX idx_goals_context ON goals (user_id, context);
