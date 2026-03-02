-- Add subscription status to user_infos table
-- This is synced from RevenueCat via webhooks

ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS is_pro_subscriber BOOLEAN DEFAULT FALSE;

-- Store raw RevenueCat subscriber data for debugging
ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS revenuecat_subscriber_data JSONB DEFAULT NULL;

-- Store last sync time
ALTER TABLE public.user_infos
ADD COLUMN IF NOT EXISTS subscription_last_synced_at TIMESTAMPTZ DEFAULT NULL;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_infos_is_pro_subscriber
ON public.user_infos(is_pro_subscriber);

-- Add comments
COMMENT ON COLUMN public.user_infos.is_pro_subscriber IS
'Whether the user has an active PRO subscription. Synced from RevenueCat via webhooks.';

COMMENT ON COLUMN public.user_infos.revenuecat_subscriber_data IS
'Raw subscriber data from RevenueCat API for debugging. Updated via webhooks.';

COMMENT ON COLUMN public.user_infos.subscription_last_synced_at IS
'Timestamp of last subscription status sync from RevenueCat.';
