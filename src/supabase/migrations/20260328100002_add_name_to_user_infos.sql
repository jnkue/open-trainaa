ALTER TABLE public.user_infos ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.user_infos.name IS 'User display name collected during onboarding.';
