-- Add average and max power columns to sessions table
ALTER TABLE sessions ADD COLUMN avg_power INT CHECK (avg_power >= 0);
ALTER TABLE sessions ADD COLUMN max_power INT CHECK (max_power >= 0);
