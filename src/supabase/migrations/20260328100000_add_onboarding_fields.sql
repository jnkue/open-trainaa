-- src/supabase/migrations/20260328100000_add_onboarding_fields.sql
ALTER TABLE public.user_infos
  ADD COLUMN IF NOT EXISTS sports                      text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals                       text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS training_days_per_week      integer  CHECK (training_days_per_week BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS weekly_training_hours        integer  CHECK (weekly_training_hours BETWEEN 0 AND 40),
  ADD COLUMN IF NOT EXISTS training_experience_years    integer  CHECK (training_experience_years BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS onboarding_completed        boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS commitment_acknowledged     boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS commitment_note             text;

COMMENT ON COLUMN public.user_infos.sports IS 'Array of sport slugs selected during onboarding.';
COMMENT ON COLUMN public.user_infos.goals IS 'Array of goal slugs: breakPR | buildConsistency | weightManagement | firstRace';
COMMENT ON COLUMN public.user_infos.training_days_per_week IS 'Self-reported available training days per week (1-7).';
COMMENT ON COLUMN public.user_infos.weekly_training_hours IS 'Current weekly training hours (0-40).';
COMMENT ON COLUMN public.user_infos.training_experience_years IS 'Years of training experience (0-50).';
COMMENT ON COLUMN public.user_infos.onboarding_completed IS 'false for all rows until user completes onboarding.';
COMMENT ON COLUMN public.user_infos.commitment_acknowledged IS 'Whether user acknowledged the commitment prompt.';
COMMENT ON COLUMN public.user_infos.commitment_note IS 'Free-text personal motivation note from onboarding.';

CREATE INDEX IF NOT EXISTS idx_user_infos_onboarding_completed
  ON public.user_infos(user_id, onboarding_completed)
  WHERE onboarding_completed = false;
