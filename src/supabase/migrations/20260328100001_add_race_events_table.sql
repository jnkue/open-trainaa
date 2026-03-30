-- src/supabase/migrations/20260328100001_add_race_events_table.sql
CREATE TABLE IF NOT EXISTS public.race_events (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        varchar(255) NOT NULL CHECK (char_length(name) > 0),
  event_date  date         NOT NULL,
  event_type  varchar(100),
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now()
);

COMMENT ON TABLE public.race_events IS 'User-entered upcoming race events.';

CREATE INDEX IF NOT EXISTS idx_race_events_user_id
  ON public.race_events(user_id);

CREATE INDEX IF NOT EXISTS idx_race_events_user_date
  ON public.race_events(user_id, event_date);

DROP TRIGGER IF EXISTS trg_race_events_updated_at ON public.race_events;
CREATE TRIGGER trg_race_events_updated_at
  BEFORE UPDATE ON public.race_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.race_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own race events" ON public.race_events;
CREATE POLICY "Users can view own race events"
  ON public.race_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own race events" ON public.race_events;
CREATE POLICY "Users can insert own race events"
  ON public.race_events FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own race events" ON public.race_events;
CREATE POLICY "Users can update own race events"
  ON public.race_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own race events" ON public.race_events;
CREATE POLICY "Users can delete own race events"
  ON public.race_events FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_events TO authenticated;
GRANT ALL ON public.race_events TO service_role;
