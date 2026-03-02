-- Add subscription store column to user_infos table
-- This stores where the subscription was purchased (stripe, app_store, play_store)

ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS subscription_store TEXT DEFAULT NULL;

COMMENT ON COLUMN public.user_infos.subscription_store IS
'The store where the subscription was purchased (stripe, app_store, play_store). Synced from RevenueCat via webhooks.';
