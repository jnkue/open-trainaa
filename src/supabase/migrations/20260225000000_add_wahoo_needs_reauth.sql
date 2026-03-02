-- Add needs_reauth flag to wahoo_tokens
-- This flag is set when token refresh fails with "too many unrevoked access tokens"
-- and the user needs to disconnect and reconnect their Wahoo account.
ALTER TABLE wahoo_tokens
    ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN DEFAULT false NOT NULL;
