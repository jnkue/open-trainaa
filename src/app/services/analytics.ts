import {apiClient} from './api';

export interface PowerCurvePoint {
  duration_seconds: number;
  max_avg_watts: number;
}

export interface PowerCurveResponse {
  power_curve: PowerCurvePoint[];
  session_count: number;
  range: string;
}

export interface CPHistoryPoint {
  date: string;
  cp_watts: number;
  w_prime: number;
}

export interface CPHistoryResponse {
  history: CPHistoryPoint[];
}

export interface PowerZone {
  zone: number;
  name: string;
  min_watts: number;
  max_watts: number | null;
}

export interface PowerZonesResponse {
  cp_watts: number;
  w_prime: number;
  zones: PowerZone[];
}

export interface RacePrediction {
  distance: string;
  predicted_seconds: number;
  predicted_formatted: string;
}

export interface RunningPredictionsResponse {
  vdot: number;
  predictions: RacePrediction[];
  based_on_sessions: number;
}

export interface VdotHistoryPoint {
  date: string;
  vdot: number;
}

export interface VdotHistoryResponse {
  history: VdotHistoryPoint[];
}

export interface HRCurvePoint {
  duration_seconds: number;
  max_avg_bpm: number;
}

export interface HRCurveResponse {
  hr_curve: HRCurvePoint[];
  session_count: number;
  range: string;
  sport: string;
}

export interface HRZone {
  zone: number;
  name: string;
  min_bpm: number;
  max_bpm: number | null;
}

export interface HRZonesResponse {
  lthr: number;
  zones: HRZone[];
}

export interface HRThresholdHistoryPoint {
  date: string;
  lthr: number;
}

export interface HRThresholdHistoryResponse {
  history: HRThresholdHistoryPoint[];
}

export interface EFHistoryPoint {
  date: string;
  ef: number;
}

export interface EFHistoryResponse {
  history: EFHistoryPoint[];
}

export interface MaxHRResponse {
  max_heart_rate: number | null;
  source: string | null;
}

export interface HRZoneDistributionResponse {
  zone_time: Record<string, number>;
  total_seconds: number;
  session_count: number;
}

export class AnalyticsService {
  async getPowerCurve(range: 'all' | 'year' | '28d' = 'all'): Promise<PowerCurveResponse> {
    return apiClient.get<PowerCurveResponse>(`/v1/analytics/power-curve?range=${range}`);
  }

  async getCPHistory(days: number = 365): Promise<CPHistoryResponse> {
    return apiClient.get<CPHistoryResponse>(`/v1/analytics/cp-history?days=${days}`);
  }

  async getPowerZones(): Promise<PowerZonesResponse> {
    return apiClient.get<PowerZonesResponse>('/v1/analytics/power-zones');
  }

  async getRunningPredictions(): Promise<RunningPredictionsResponse> {
    return apiClient.get<RunningPredictionsResponse>('/v1/analytics/running-predictions');
  }

  async getVdotHistory(days: number = 365): Promise<VdotHistoryResponse> {
    return apiClient.get<VdotHistoryResponse>(`/v1/analytics/vdot-history?days=${days}`);
  }

  async getHRCurve(sport: 'cycling' | 'running', range: 'all' | 'year' | '28d' = 'all'): Promise<HRCurveResponse> {
    return apiClient.get<HRCurveResponse>(`/v1/analytics/hr-curve?sport=${sport}&range=${range}`);
  }

  async getHRZones(sport: 'cycling' | 'running'): Promise<HRZonesResponse> {
    return apiClient.get<HRZonesResponse>(`/v1/analytics/hr-zones?sport=${sport}`);
  }

  async getHRThresholdHistory(sport: 'cycling' | 'running', days: number = 365): Promise<HRThresholdHistoryResponse> {
    return apiClient.get<HRThresholdHistoryResponse>(`/v1/analytics/hr-threshold-history?sport=${sport}&days=${days}`);
  }

  async getEFHistory(sport: 'cycling' | 'running', days: number = 365): Promise<EFHistoryResponse> {
    return apiClient.get<EFHistoryResponse>(`/v1/analytics/ef-history?sport=${sport}&days=${days}`);
  }

  async getMaxHR(sport: 'cycling' | 'running'): Promise<MaxHRResponse> {
    return apiClient.get<MaxHRResponse>(`/v1/analytics/max-hr?sport=${sport}`);
  }

  async updateMaxHR(sport: 'cycling' | 'running', maxHeartRate: number): Promise<MaxHRResponse> {
    return apiClient.put<MaxHRResponse>('/v1/analytics/max-hr', {sport, max_heart_rate: maxHeartRate});
  }

  async getHRZoneDistribution(sport: 'cycling' | 'running', days: number = 28): Promise<HRZoneDistributionResponse> {
    return apiClient.get<HRZoneDistributionResponse>(`/v1/analytics/hr-zone-distribution?sport=${sport}&days=${days}`);
  }
}

export const analyticsService = new AnalyticsService();
