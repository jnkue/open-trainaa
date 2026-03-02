
-- Migration: create user_infos table
-- Stores per-user physiological and performance attributes used by the training planner

CREATE TABLE IF NOT EXISTS public.user_infos (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

	-- llm_user_information
	llm_user_information TEXT, -- JSON object to store user strategy,preferences, goals etc.
	llm_long_term_training_strategy TEXT, -- long term strategy for training

	-- heart rate
	max_heart_rate integer,
	threshold_heart_rate integer,
	resting_heart_rate integer,

	-- power
	functional_threshold_power integer,

	-- running
	run_threshold_pace interval, -- pace at threshold in format 'mm:ss' per km or mile
	vdot numeric(5,2),

	-- other metrics
	weight_kg numeric(6,2),
	height_cm numeric(6,2),

	-- units / metadata
	preferred_units text DEFAULT 'metric', -- 'metric' or 'imperial'
	notes text,

	automatic_calculation_mode BOOLEAN DEFAULT true,

	--timezone info
	timezone VARCHAR(100),

	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);




-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_infos_updated_at ON public.user_infos;
CREATE TRIGGER trg_user_infos_updated_at
	BEFORE UPDATE ON public.user_infos
	FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- History-Tabelle für user_infos
CREATE TABLE IF NOT EXISTS public.user_infos_history (
	id bigserial PRIMARY KEY,
	user_info_id uuid,
	user_id uuid,
	
	-- Alle Felder aus der Haupttabelle
	llm_user_information TEXT,
	llm_long_term_training_strategy TEXT,
	max_heart_rate integer,
	threshold_heart_rate integer,
	resting_heart_rate integer,
	functional_threshold_power integer,
	run_threshold_pace interval,
	vdot numeric(5,2),
	weight_kg numeric(6,2),
	height_cm numeric(6,2),
	preferred_units text,
	notes text,
	timezone VARCHAR(100),
	
	-- Audit-Felder
	action text NOT NULL,                -- 'INSERT', 'UPDATE', 'DELETE'
	changed_at timestamptz DEFAULT now()
);

-- Trigger-Funktion für user_infos Audit
CREATE OR REPLACE FUNCTION public.log_user_infos_changes()
RETURNS TRIGGER AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		INSERT INTO public.user_infos_history (
			user_info_id, user_id, llm_user_information, llm_long_term_training_strategy,
			max_heart_rate, threshold_heart_rate, resting_heart_rate,
			functional_threshold_power, run_threshold_pace, vdot,
			weight_kg, height_cm, preferred_units, notes, timezone, action
		) VALUES (
			OLD.id, OLD.user_id, OLD.llm_user_information, OLD.llm_long_term_training_strategy,
			OLD.max_heart_rate, OLD.threshold_heart_rate, OLD.resting_heart_rate,
			OLD.functional_threshold_power, OLD.run_threshold_pace, OLD.vdot,
			OLD.weight_kg, OLD.height_cm, OLD.preferred_units, OLD.notes, OLD.timezone, 'DELETE'
		);
		RETURN OLD;
	ELSIF TG_OP = 'UPDATE' THEN
		INSERT INTO public.user_infos_history (
			user_info_id, user_id, llm_user_information, llm_long_term_training_strategy,
			max_heart_rate, threshold_heart_rate, resting_heart_rate,
			functional_threshold_power, run_threshold_pace, vdot,
			weight_kg, height_cm, preferred_units, notes, timezone, action
		) VALUES (
			NEW.id, NEW.user_id, NEW.llm_user_information, NEW.llm_long_term_training_strategy,
			NEW.max_heart_rate, NEW.threshold_heart_rate, NEW.resting_heart_rate,
			NEW.functional_threshold_power, NEW.run_threshold_pace, NEW.vdot,
			NEW.weight_kg, NEW.height_cm, NEW.preferred_units, NEW.notes, NEW.timezone, 'UPDATE'
		);
		RETURN NEW;
	ELSIF TG_OP = 'INSERT' THEN
		INSERT INTO public.user_infos_history (
			user_info_id, user_id, llm_user_information, llm_long_term_training_strategy,
			max_heart_rate, threshold_heart_rate, resting_heart_rate,
			functional_threshold_power, run_threshold_pace, vdot,
			weight_kg, height_cm, preferred_units, notes, timezone, action
		) VALUES (
			NEW.id, NEW.user_id, NEW.llm_user_information, NEW.llm_long_term_training_strategy,
			NEW.max_heart_rate, NEW.threshold_heart_rate, NEW.resting_heart_rate,
			NEW.functional_threshold_power, NEW.run_threshold_pace, NEW.vdot,
			NEW.weight_kg, NEW.height_cm, NEW.preferred_units, NEW.notes, NEW.timezone, 'INSERT'
		);
		RETURN NEW;
	END IF;
END;
$$ LANGUAGE plpgsql;

-- Audit-Trigger an user_infos Tabelle hängen
DROP TRIGGER IF EXISTS user_infos_audit ON public.user_infos;
CREATE TRIGGER user_infos_audit
	AFTER INSERT OR UPDATE OR DELETE ON public.user_infos
	FOR EACH ROW EXECUTE FUNCTION public.log_user_infos_changes();
