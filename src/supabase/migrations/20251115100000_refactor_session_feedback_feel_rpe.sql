-- Migration: Refactor session feedback to use feel/rpe integers
-- Date: 2025-11-15
-- Description: Replace feeling enum and feedback_text with feel and rpe integer columns

-- Add temporary feel/rpe columns to sessions table (for FIT file extraction)
-- These will be copied to session_custom_data during post-processing
ALTER TABLE sessions
ADD COLUMN feel INTEGER CHECK (feel IN (0, 25, 50, 75, 100));

ALTER TABLE sessions
ADD COLUMN rpe INTEGER CHECK (rpe IN (0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100));

-- Add feel column to session_custom_data
-- Feel scale (from FIT files and manual input):
-- 0: Very Weak
-- 25: Weak
-- 50: Normal
-- 75: Strong
-- 100: Very Strong
ALTER TABLE session_custom_data
ADD COLUMN feel INTEGER CHECK (feel IN (0, 25, 50, 75, 100));

-- Add rpe column to session_custom_data
-- RPE (Rate of Perceived Exertion) scale (from FIT files and manual input):
-- 0: Nothing at all
-- 10: Very Easy
-- 20: Easy
-- 30: Easy
-- 40: Comfortable
-- 50: Slightly Challenging
-- 60: Difficult
-- 70: Hard
-- 80: Very Hard
-- 90: Extremely Hard
-- 100: Maximal Effort
ALTER TABLE session_custom_data
ADD COLUMN rpe INTEGER CHECK (rpe IN (0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100));

-- Remove old feeling enum column
ALTER TABLE session_custom_data
DROP COLUMN IF EXISTS feeling;

-- Remove feedback_text column
ALTER TABLE session_custom_data
DROP COLUMN IF EXISTS feedback_text;

-- Add comments for documentation
COMMENT ON COLUMN session_custom_data.feel IS 'User perceived feeling: 0=Very Weak, 25=Weak, 50=Normal, 75=Strong, 100=Very Strong. Can be from FIT file workout_feel or manual input.';
COMMENT ON COLUMN session_custom_data.rpe IS 'Rate of Perceived Exertion (0-100 scale): 0=Nothing at all, 10=Very Easy, 20=Easy, 30=Easy, 40=Comfortable, 50=Slightly Challenging, 60=Difficult, 70=Hard, 80=Very Hard, 90=Extremely Hard, 100=Maximal Effort. Can be from FIT file workout_rpe or manual input.';
