-- A flexible Saturday–Sunday window, separate from scheduled_for.
-- Existing task RLS applies; this adds no permissions and moves no tasks.
BEGIN;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS weekend_start date;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass
      AND conname = 'tasks_weekend_start_saturday'
  ) THEN
    ALTER TABLE public.tasks ADD CONSTRAINT tasks_weekend_start_saturday
      CHECK (weekend_start IS NULL OR EXTRACT(DOW FROM weekend_start) = 6);
  END IF;
END $$;
COMMENT ON COLUMN public.tasks.weekend_start IS
  'Explicit flexible Saturday–Sunday plan. Does not assign a day/time or automatically carry unfinished work forward.';
COMMIT;
