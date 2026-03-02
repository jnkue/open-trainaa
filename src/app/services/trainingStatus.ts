/**
 * Training Status Service
 * Provides methods to fetch training status metrics from the API
 */

import {apiClient} from './api';

export interface TrainingStatus {
	date: string;
	fitness: number;
	fatigue: number;
	form: number;
	daily_hr_load: number;
	daily_training_time: number;
	training_streak: number;
	rest_days_streak: number;
	training_days_7d: number;
	training_monotony: number;
	training_strain: number;
	avg_training_time_7d: number;
	avg_training_time_21d: number;
	training_days_21d: number;
	fitness_trend_7d: number;
	fatigue_trend_7d: number;
}

export class TrainingStatusService {
	/**
	 * Get the current training status for the authenticated user
	 */
	async getCurrentTrainingStatus(): Promise<TrainingStatus> {
		try {
			return await apiClient.get<TrainingStatus>('/training-status/current');
		} catch (error) {
			console.error('Error fetching current training status:', error);
			throw error;
		}
	}

	/**
	 * Get training status history for the authenticated user
	 * @param days Number of days to fetch (default: 30)
	 */
	async getTrainingStatusHistory(days: number = 30): Promise<TrainingStatus[]> {
		try {
			return await apiClient.get<TrainingStatus[]>(`/training-status/history?days=${days}`);
		} catch (error) {
			console.error('Error fetching training status history:', error);
			throw error;
		}
	}
}

export const trainingStatusService = new TrainingStatusService();