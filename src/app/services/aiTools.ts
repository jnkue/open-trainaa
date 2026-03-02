import { apiClient } from './api';

export interface CalculationRequest {
  user_id: string;
  field_type: 'max_heart_rate' | 'functional_threshold_power' | 'threshold_heart_rate' | 'run_threshold_pace';
}

export interface CalculationResponse {
  field_type: string;
  calculated_value: number;
}

export interface SupportedField {
  field_type: string;
  display_name: string;
  required_data: string[];
  optional_data: string[];
}

export interface SupportedFieldsResponse {
  supported_fields: SupportedField[];
}

export class AIToolsService {
  private static readonly BASE_PATH = '/ai-tools';

  /**
   * Calculate user attribute using AI/ML models
   */
  static async calculateAttribute(request: CalculationRequest): Promise<CalculationResponse> {
    try {
      const response = await apiClient.post<CalculationResponse>(
        `/v1${this.BASE_PATH}/calculate-attribute`,
        request
      );
      return response;
    } catch (error) {
      console.error('Error calculating attribute:', error);
      throw new Error('Failed to calculate attribute');
    }
  }



  /**
   * Helper method to map field keys to backend format
   */
  static mapFieldKey(fieldKey: string): string {
    const fieldMapping: Record<string, string> = {
      'max_heart_rate': 'max_heart_rate',
      'functional_threshold_power': 'functional_threshold_power',
      'threshold_heart_rate': 'threshold_heart_rate',
      'run_threshold_pace': 'run_threshold_pace',
      'weight_kg': 'weight_kg',
      'height_cm': 'height_cm',
    };
    
    return fieldMapping[fieldKey] || fieldKey;
  }

  /**
   * Check if a field is supported for AI calculation
   */
  static isSupportedField(fieldKey: string): boolean {
    const supportedFields = ['max_heart_rate', 'functional_threshold_power', 'threshold_heart_rate', 'run_threshold_pace'];
    return supportedFields.includes(fieldKey);
  }
}
