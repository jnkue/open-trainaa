-- Add BYOK (Bring Your Own Key) columns to user_infos
-- Allows users to provide their own OpenRouter API key as an alternative to PRO subscription

ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS openrouter_api_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS byok_accepted_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.user_infos.openrouter_api_key_encrypted IS 'Fernet-encrypted OpenRouter API key provided by the user (BYOK)';
COMMENT ON COLUMN public.user_infos.byok_accepted_at IS 'Timestamp when the user accepted the BYOK terms and cost responsibility';
