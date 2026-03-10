-- Migration: Add push notification preferences to user_infos
-- and create user_push_tokens table for Expo push token storage

-- 1. Add notification preference columns to user_infos
ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS push_notification_feedback BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS push_notification_daily_overview BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.user_infos.push_notification_feedback IS
  'Whether to send push notification when AI feedback is generated for a ride. Default FALSE.';
COMMENT ON COLUMN public.user_infos.push_notification_daily_overview IS
  'Whether to send daily morning training overview push notification. Default FALSE.';

-- 2. Create user_push_tokens table (one user can have multiple devices)
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    device_name TEXT,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, expo_push_token)
);

-- Index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_user_push_tokens_updated_at ON public.user_push_tokens;
CREATE TRIGGER trg_user_push_tokens_updated_at
    BEFORE UPDATE ON public.user_push_tokens
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS policies for user_push_tokens
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push tokens"
    ON public.user_push_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push tokens"
    ON public.user_push_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens"
    ON public.user_push_tokens FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
    ON public.user_push_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Grant permissions (following pattern from 20251002140857_permissions.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;
GRANT ALL ON public.user_push_tokens TO service_role;
