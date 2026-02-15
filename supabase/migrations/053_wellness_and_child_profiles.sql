-- Migration 053: Personal Wellness & Child Profiles
-- Part of the Relish redesign (Phase 2)

-- Personal wellness data — per adult user, NOT household-level
-- This feeds the daily script's personal coaching (exercise, eating, sleep, etc.)
alter table user_profiles
  add column if not exists personal_wellness jsonb default '{}';

-- Child profile data — filled out BY PARENTS about each child
-- Stored on family_members for children (member_type='core', role_label='child')
-- This is structured data, not from AI conversation
alter table family_members
  add column if not exists child_profile jsonb default null;

-- Comment explaining the wellness schema:
-- personal_wellness: {
--   exercise: { goals: string, current_habits: string, preferred_activities: string[], schedule: string },
--   nutrition: { goals: string, restrictions: string[], current_habits: string, meal_preferences: string },
--   sleep: { target_bedtime: string, target_waketime: string, current_patterns: string, challenges: string },
--   stress: { triggers: string[], coping_strategies: string[], warning_signs: string },
--   growth: { priorities: string[], hobbies: string[], reading: string, learning_goals: string },
--   assessed_at: timestamp
-- }

-- Comment explaining the child_profile schema:
-- child_profile: {
--   developmental_needs: string,
--   academic_focus: string[],
--   social_needs: string,
--   physical_activity: string[],
--   screen_boundaries: string,
--   emotional_patterns: string,
--   routines_that_work: string[],
--   routines_that_dont: string[],
--   special_interests: string[],
--   challenges: string[],
--   parent_notes: string,
--   assessed_at: timestamp,
--   assessed_by: uuid[]
-- }
