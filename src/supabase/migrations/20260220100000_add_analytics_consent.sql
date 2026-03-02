-- Migration: Add analytics_consent field to user_infos table
-- Stores user's consent for analytics tools (Sentry, Langfuse)
-- NULL = not yet asked, TRUE = consented, FALSE = declined

ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.user_infos.analytics_consent IS
  'User consent for analytics tools (Sentry, Langfuse). NULL = not asked, TRUE = consented, FALSE = declined';
