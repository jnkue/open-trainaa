-- Trigger to mark training_status.needs_update = TRUE when a session is deleted
-- This ensures that training metrics are recalculated for the affected day

-- Function to handle session deletion and mark training status for update
CREATE OR REPLACE FUNCTION mark_training_status_needs_update_on_session_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the training_status for the date of the deleted session
    -- Set needs_update to TRUE for the user and date
    UPDATE training_status
    SET
        needs_update = TRUE,
        updated_at = NOW()
    WHERE
        user_id = OLD.user_id
        AND date = DATE(OLD.start_time);

    -- If no row exists for that date, create one with needs_update = TRUE
    -- This handles the case where training_status might not exist yet
    INSERT INTO training_status (user_id, date, needs_update, updated_at)
    VALUES (OLD.user_id, DATE(OLD.start_time), TRUE, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET
        needs_update = TRUE,
        updated_at = NOW();

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on the sessions table
DROP TRIGGER IF EXISTS trigger_session_delete_needs_update ON sessions;

CREATE TRIGGER trigger_session_delete_needs_update
    AFTER DELETE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION mark_training_status_needs_update_on_session_delete();

-- Add comment for documentation
COMMENT ON FUNCTION mark_training_status_needs_update_on_session_delete() IS
'Marks training_status.needs_update = TRUE for the day when a session is deleted, ensuring training metrics get recalculated';

COMMENT ON TRIGGER trigger_session_delete_needs_update ON sessions IS
'Automatically flags training status for recalculation when a session is deleted';
