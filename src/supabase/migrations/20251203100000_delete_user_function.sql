-- Create a function to delete the current user's account
-- This function runs with SECURITY DEFINER to allow deleting from auth.users
-- All related data will be deleted via CASCADE constraints

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Get the current user's ID
    current_user_id := auth.uid();

    -- Ensure a user is authenticated
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Delete the user from auth.users
    -- This will cascade delete all related data in public tables
    -- due to ON DELETE CASCADE foreign key constraints
    DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- Add a comment for documentation
COMMENT ON FUNCTION public.delete_user() IS 'Allows authenticated users to delete their own account. All related data is deleted via CASCADE.';
