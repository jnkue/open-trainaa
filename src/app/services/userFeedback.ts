import { apiClient } from './api';
import { APP_VERSION } from '@/constants/version';

// General User Feedback types
export interface UserFeedback {
  id: string;
  user_id: string;
  type: 'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback';
  text: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateUserFeedback {
  type: 'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback';
  text: string;
  metadata?: Record<string, any>;
}

export interface UpdateUserFeedback {
  text?: string;
  metadata?: Record<string, any>;
}

export interface UserFeedbackFilters {
  type?: 'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback';
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
  limit?: number;
  offset?: number;
}

// User Feedback Service
export class UserFeedbackService {
  // Create new user feedback
  async createFeedback(feedback: CreateUserFeedback): Promise<UserFeedback> {
    try {
      const result = await apiClient.post<UserFeedback>('/v1/user-feedback/', feedback);
      return result;
    } catch (error) {
      console.error('Error creating user feedback:', error);
      throw new Error('Failed to submit feedback. Please try again.');
    }
  }

  // Get user feedback with optional filters
  async getUserFeedback(filters?: UserFeedbackFilters): Promise<UserFeedback[]> {
    try {
      const params = new URLSearchParams();

      if (filters?.type) params.append('type_filter', filters.type);
      if (filters?.status) params.append('status_filter', filters.status);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const endpoint = params.toString()
        ? `/v1/user-feedback/?${params.toString()}`
        : '/v1/user-feedback/';

      const result = await apiClient.get<UserFeedback[]>(endpoint);
      return result;
    } catch (error) {
      console.error('Error fetching user feedback:', error);
      throw new Error('Failed to load feedback history.');
    }
  }

  // Get specific feedback by ID
  async getFeedbackById(feedbackId: string): Promise<UserFeedback> {
    try {
      const result = await apiClient.get<UserFeedback>(`/v1/user-feedback/${feedbackId}`);
      return result;
    } catch (error) {
      console.error('Error fetching feedback by ID:', error);
      throw new Error('Failed to load feedback.');
    }
  }

  // Update existing feedback
  async updateFeedback(feedbackId: string, updates: UpdateUserFeedback): Promise<UserFeedback> {
    try {
      const result = await apiClient.put<UserFeedback>(`/v1/user-feedback/${feedbackId}`, updates);
      return result;
    } catch (error) {
      console.error('Error updating user feedback:', error);
      throw new Error('Failed to update feedback.');
    }
  }

  // Delete feedback
  async deleteFeedback(feedbackId: string): Promise<void> {
    try {
      await apiClient.delete(`/v1/user-feedback/${feedbackId}`);
    } catch (error) {
      console.error('Error deleting user feedback:', error);
      throw new Error('Failed to delete feedback.');
    }
  }

  // Helper method to create feedback with device/app metadata
  async submitFeedbackWithMetadata(
    type: 'feature_request' | 'bug_report' | 'general_feedback' | 'feeling_feedback',
    text: string,
    additionalMetadata?: Record<string, any>
  ): Promise<UserFeedback> {
    const metadata = {
      app_version: APP_VERSION,
      platform: 'mobile',
      timestamp: new Date().toISOString(),
      ...additionalMetadata,
    };

    return this.createFeedback({
      type,
      text,
      metadata,
    });
  }
}

// Export singleton instance
export const userFeedbackService = new UserFeedbackService();