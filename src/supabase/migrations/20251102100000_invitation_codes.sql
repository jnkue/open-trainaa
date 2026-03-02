-- Migration: Create invitation_codes table
-- Simple one-time use invitation codes for registration

CREATE TABLE IF NOT EXISTS public.invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    used BOOLEAN DEFAULT false NOT NULL,
    used_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create index for faster code lookups
CREATE INDEX idx_invitation_codes_code ON public.invitation_codes(code);
CREATE INDEX idx_invitation_codes_used ON public.invitation_codes(used);

-- Enable Row Level Security
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read invitation codes (needed for validation)
CREATE POLICY "Anyone can read invitation codes"
    ON public.invitation_codes
    FOR SELECT
    TO public
    USING (true);

-- Policy: Only authenticated users can update invitation codes (via API)
CREATE POLICY "Authenticated users can update invitation codes"
    ON public.invitation_codes
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.invitation_codes IS 'One-time use invitation codes for user registration. Codes can be created manually in Supabase.';
