import { apiClient } from './api';

// New workout types based on the simplified database schema
export interface Workout {
  id: string;
  name: string;
  description?: string;
  sport: 'Cycling' | 'Running' | 'Swimming' | 'Strength' | 'Yoga';
  workout_minutes: number;
  workout_text: string; // The actual workout in text format
  is_public: boolean;
  user_id: string;
  source?: 'chat' | 'user'; // Origin: chat (AI-generated) or user (manually created)
  created_at: string;
  updated_at: string;
}

export interface PlannedWorkout {
  id: string;
  workout_id: string;
  scheduled_time: string; // ISO timestamp
  user_id: string;
  created_at: string;
  updated_at: string;
  // Joined workout data
  workout?: Workout;
}

export class WorkoutService {
  // Get all planned workouts for the current user
  async getPlannedWorkouts(): Promise<PlannedWorkout[]> {
    try {
      const { data, error } = await apiClient.supabase
        .from('workouts_scheduled')
        .select(`
          *,
          workout:workouts(*)
        `)
        .order('scheduled_time', { ascending: true });

      if (error) {
        console.error('Supabase error fetching planned workouts:', error);
        throw new Error(`Failed to fetch planned workouts: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching planned workouts:', error);
      throw error;
    }
  }

  // Get a specific workout by ID
  async getWorkout(workoutId: string): Promise<Workout | null> {
    try {
      const { data, error } = await apiClient.supabase
        .from('workouts')
        .select('*')
        .eq('id', workoutId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        console.error('Supabase error fetching workout:', error);
        throw new Error(`Failed to fetch workout: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error fetching workout:', error);
      throw error;
    }
  }

  // Get all workouts (public + user's own)
  async getWorkouts(): Promise<Workout[]> {
    try {
      const { data, error } = await apiClient.supabase
        .from('workouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error fetching workouts:', error);
        throw new Error(`Failed to fetch workouts: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching workouts:', error);
      throw error;
    }
  }

  // Create a new workout
  async createWorkout(workout: Omit<Workout, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Workout> {
    try {
      // Get current user
      const { data: { user }, error: userError } = await apiClient.supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const workoutWithUser = {
        ...workout,
        user_id: user.id
      };

      const { data, error } = await apiClient.supabase
        .from('workouts')
        .insert([workoutWithUser])
        .select()
        .single();

      if (error) {
        console.error('Supabase error creating workout:', error);
        throw new Error(`Failed to create workout: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error creating workout:', error);
      throw error;
    }
  }

  // Schedule a workout
  async scheduleWorkout(workoutId: string, scheduledTime: string): Promise<PlannedWorkout> {
    try {
      // Get current user
      const { data: { user }, error: userError } = await apiClient.supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await apiClient.supabase
        .from('workouts_scheduled')
        .insert([{
          workout_id: workoutId,
          scheduled_time: scheduledTime,
          user_id: user.id
        }])
        .select(`
          *,
          workout:workouts(*)
        `)
        .single();

      if (error) {
        console.error('Supabase error scheduling workout:', error);
        throw new Error(`Failed to schedule workout: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error scheduling workout:', error);
      throw error;
    }
  }

  // Update a workout
  async updateWorkout(workoutId: string, updates: Partial<Omit<Workout, 'id' | 'created_at' | 'user_id'>>): Promise<Workout> {
    try {
      const { data, error } = await apiClient.supabase
        .from('workouts')
        .update(updates)
        .eq('id', workoutId)
        .select()
        .single();

      if (error) {
        console.error('Supabase error updating workout:', error);
        throw new Error(`Failed to update workout: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error updating workout:', error);
      throw error;
    }
  }

  // Delete a planned workout
  async deletePlannedWorkout(plannedWorkoutId: string): Promise<void> {
    try {
      const { error } = await apiClient.supabase
        .from('workouts_scheduled')
        .delete()
        .eq('id', plannedWorkoutId);

      if (error) {
        console.error('Supabase error deleting planned workout:', error);
        throw new Error(`Failed to delete planned workout: ${error.message}`);
      }
    } catch (error) {
      console.error('Error deleting planned workout:', error);
      throw error;
    }
  }

  // Download workout as FIT file
  async downloadWorkoutAsFit(workoutId: string): Promise<Blob> {
    try {
      const session = await apiClient.supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${apiClient.BASE_URL}/v1/workouts/${workoutId}/download-fit`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download FIT file: ${errorText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Error downloading FIT file:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const workoutService = new WorkoutService();

// Legacy types for backward compatibility (deprecated)
export interface WorkoutStep {
  step_id?: string;
  step_order: number;
  step_type: string;
  duration_seconds?: number;
  intensity_percentage?: number;
  target_power?: number;
  target_heartrate?: number;
  distance_meters?: number;
  pace_target?: string;
  step_description?: string;
}

export interface TrainingSession {
  session_id?: string;
  concept_id?: string;
  session_date: string;
  session_type: string;
  sport_type: string;
  duration_minutes: number;
  intensity_zone: string;
  rationale?: string;
  ai_generated: boolean;
  workout_steps: WorkoutStep[];
  created_at?: string;
  completed_at?: string;
}
