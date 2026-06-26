-- ============================================================================
-- COS Action Layer — turn Symphony from a system of record into a system of action
--
-- This migration upgrades the existing action_queue spine into a closed loop:
--   #1 Ingestion   → cos_ingest_proposals(): email_action_items → proposed actions
--   #3 Authority   → authority_tier + on_behalf_of + confidence columns
--   #4 Runtime     → pg_cron schedule running the ingestor server-side (no client)
--   #5 World-model → get_household_context(): one assembled JSON the agent reasons over
--
-- Effectors (#2) and the wall face (#6) are wired in code, not SQL.
--
-- SAFETY: every proposal lands as status='pending'. Nothing auto-executes.
--         Outbound effectors (email) default to DRAFT, never send. The
--         authority_tier column EXISTS to gate future auto-execution but this
--         migration does NOT enable any auto-execution path.
-- ============================================================================

-- ─── #3 Authority model: extend action_queue ────────────────────────────────

-- Fix latent bug: the executor handles 'send_text' but the CHECK never allowed it.
-- Also add 'draft_email' (the safe default for outbound) and 'schedule_meeting'
-- stays. Rebuild the constraint with the full, current action vocabulary.
ALTER TABLE action_queue DROP CONSTRAINT IF EXISTS action_queue_action_type_check;
ALTER TABLE action_queue ADD CONSTRAINT action_queue_action_type_check
  CHECK (action_type IN (
    'send_email',        -- send an email (gated; defaults to draft in the executor)
    'draft_email',       -- create a Gmail draft only — never sends
    'create_task',       -- create a task
    'schedule_meeting',  -- create a calendar event
    'update_contact',    -- update contact info
    'write_vault_note',  -- write a note to the vault
    'send_text'          -- send an iMessage via Open Brain
  ));

-- Authority tier: how much autonomy this action is allowed.
--   never_auto  — always requires a human tap (outbound comms default here)
--   ask_first   — proposed to the human; the standard tier
--   auto_ok     — eligible for future auto-execution (NOT enabled by this migration)
ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS authority_tier TEXT NOT NULL DEFAULT 'ask_first'
    CHECK (authority_tier IN ('never_auto', 'ask_first', 'auto_ok'));

-- Who the action is performed ON BEHALF OF (which household member's voice/account).
ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES family_members(id) ON DELETE SET NULL;

-- Agent confidence in the proposal (0..1) — drives ranking and future auto-exec gating.
ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS confidence REAL CHECK (confidence >= 0 AND confidence <= 1);

-- ─── #1 + #4 Ingestion as pure SQL, runnable by cron with no secrets ─────────

-- Turn unprocessed email action items into proposed queue actions for one user.
-- Idempotent: skips email items already represented in the queue (via source_ref).
-- Returns the number of new proposals created.
CREATE OR REPLACE FUNCTION cos_ingest_proposals(p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT
      e.id,
      e.title,
      e.description,
      e.urgency,
      e.due_date,
      e.relevant_member_id,
      e.email_subject
    FROM email_action_items e
    WHERE e.user_id = p_user
      AND e.status = 'new'
      AND e.task_id IS NULL
      -- not already proposed
      AND NOT EXISTS (
        SELECT 1 FROM action_queue q
        WHERE q.user_id = p_user
          AND q.source = 'email'
          AND q.source_ref = e.id::text
      )
  ), inserted AS (
    INSERT INTO action_queue (
      user_id, action_type, summary, payload, source, source_ref,
      context, status, authority_tier, on_behalf_of, confidence
    )
    SELECT
      p_user,
      'create_task',
      'Add task from email: ' || c.title,
      jsonb_build_object(
        'title', c.title,
        'notes', COALESCE(c.description, '') ||
                 CASE WHEN c.email_subject IS NOT NULL
                      THEN E'\n\nFrom email: ' || c.email_subject ELSE '' END,
        'context', 'family',
        'bucket', CASE WHEN c.due_date IS NOT NULL THEN 'timed' ELSE 'inbox' END,
        'scheduled_for', c.due_date
      ),
      'email',
      c.id::text,
      jsonb_build_object('urgency', c.urgency, 'origin', 'email_action_item'),
      'pending',
      'ask_first',
      c.relevant_member_id,
      CASE c.urgency WHEN 'urgent' THEN 0.9 WHEN 'normal' THEN 0.7 ELSE 0.5 END
    FROM candidates c
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

-- Run the ingestor for every user who has unprocessed email items.
-- This is what cron calls — entirely server-side, no edge function, no secret.
CREATE OR REPLACE FUNCTION cos_ingest_all()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_total INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id FROM email_action_items
    WHERE status = 'new' AND task_id IS NULL
  LOOP
    v_total := v_total + cos_ingest_proposals(v_user);
  END LOOP;
  RETURN v_total;
END;
$$;

-- ─── #4 Proactive runtime: schedule the ingestor server-side ─────────────────
-- pg_cron runs cos_ingest_all() every 30 minutes regardless of whether any
-- client/tab is open. THIS is "works when nobody is looking." Pure SQL path,
-- so it has no dependency on edge-function secrets or a running browser.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- unschedule a prior version if re-running this migration
  PERFORM cron.unschedule('cos-ingest')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cos-ingest');
EXCEPTION WHEN OTHERS THEN
  -- cron schema not present in some local stacks; ignore
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('cos-ingest', '*/30 * * * *', 'SELECT cos_ingest_all();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available in this environment; cos-ingest not scheduled. Run cos_ingest_all() manually or schedule in prod.';
END;
$$;

-- ─── #5 Household world-model: one assembled JSON the agent reasons over ─────
-- Gathers the standing model of the household: members (with health/diet/age),
-- service-provider contacts, and the active obligation surface. The agent and
-- proactive engine call this instead of stitching six tables together.
CREATE OR REPLACE FUNCTION get_household_context(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fm.id,
        'name', fm.name,
        'role', fm.role_label,
        'age_range', fm.age_range,
        'allergies', fm.allergies,
        'medications', fm.medications,
        'dietary_restrictions', fm.dietary_restrictions,
        'health_conditions', fm.health_conditions
      ) ORDER BY fm.display_order)
      FROM family_members fm
      WHERE fm.user_id = p_user AND fm.member_type = 'core'
    ), '[]'::jsonb),
    'service_providers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'category', c.category,
        'phone', c.phone, 'email', c.email, 'relationship', c.relationship
      ) ORDER BY c.name)
      FROM contacts c
      WHERE c.user_id = p_user
        AND c.category IN ('service_provider', 'medical', 'school', 'professional')
    ), '[]'::jsonb),
    'obligations', jsonb_build_object(
      'overdue_count', (
        SELECT count(*) FROM tasks t
        WHERE t.user_id = p_user AND t.completed = false
          AND t.scheduled_for IS NOT NULL AND t.scheduled_for < now()
      ),
      'waiting_count', (
        SELECT count(*) FROM tasks t
        WHERE t.user_id = p_user AND t.completed = false AND t.is_waiting = true
      ),
      'inbox_count', (
        SELECT count(*) FROM tasks t
        WHERE t.user_id = p_user AND t.completed = false
          AND t.scheduled_for IS NULL AND t.bucket = 'inbox'
      ),
      'active_routines', (
        SELECT count(*) FROM routines r
        WHERE r.user_id = p_user AND r.visibility = 'active'
      )
    ),
    'pending_actions', (
      SELECT count(*) FROM action_queue q
      WHERE q.user_id = p_user AND q.status = 'pending'
    ),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Index to make the "already proposed?" idempotency check fast.
CREATE INDEX IF NOT EXISTS idx_action_queue_source_ref
  ON action_queue(user_id, source, source_ref)
  WHERE source_ref IS NOT NULL;
