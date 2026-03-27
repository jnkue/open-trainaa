import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {
  analyticsService,
  type PowerCurveResponse,
  type CPHistoryResponse,
  type PowerZonesResponse,
  type RunningPredictionsResponse,
  type VdotHistoryResponse,
  type HRCurveResponse,
  type HRZonesResponse,
  type HRThresholdHistoryResponse,
  type EFHistoryResponse,
  type MaxHRResponse,
  type HRZoneDistributionResponse,
} from '@/services/analytics';

export const analyticsKeys = {
  all: ['analytics'] as const,
  powerCurve: (range: string) => [...analyticsKeys.all, 'power-curve', range] as const,
  cpHistory: (days: number) => [...analyticsKeys.all, 'cp-history', days] as const,
  powerZones: () => [...analyticsKeys.all, 'power-zones'] as const,
  runningPredictions: () => [...analyticsKeys.all, 'running-predictions'] as const,
  vdotHistory: (days: number) => [...analyticsKeys.all, 'vdot-history', days] as const,
  hrCurve: (sport: string, range: string) => [...analyticsKeys.all, 'hr-curve', sport, range] as const,
  hrZones: (sport: string) => [...analyticsKeys.all, 'hr-zones', sport] as const,
  hrThresholdHistory: (sport: string, days: number) => [...analyticsKeys.all, 'hr-threshold-history', sport, days] as const,
  efHistory: (sport: string, days: number) => [...analyticsKeys.all, 'ef-history', sport, days] as const,
  maxHr: (sport: string) => [...analyticsKeys.all, 'max-hr', sport] as const,
  hrZoneDistribution: (sport: string, days: number) => [...analyticsKeys.all, 'hr-zone-distribution', sport, days] as const,
};

export function usePowerCurve(range: 'all' | 'year' | '28d' = 'all') {
  return useQuery<PowerCurveResponse>({
    queryKey: analyticsKeys.powerCurve(range),
    queryFn: () => analyticsService.getPowerCurve(range),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCPHistory(days: number = 365) {
  return useQuery<CPHistoryResponse>({
    queryKey: analyticsKeys.cpHistory(days),
    queryFn: () => analyticsService.getCPHistory(days),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function usePowerZones() {
  return useQuery<PowerZonesResponse>({
    queryKey: analyticsKeys.powerZones(),
    queryFn: () => analyticsService.getPowerZones(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useRunningPredictions() {
  return useQuery<RunningPredictionsResponse>({
    queryKey: analyticsKeys.runningPredictions(),
    queryFn: () => analyticsService.getRunningPredictions(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useVdotHistory(days: number = 365) {
  return useQuery<VdotHistoryResponse>({
    queryKey: analyticsKeys.vdotHistory(days),
    queryFn: () => analyticsService.getVdotHistory(days),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useHRCurve(sport: 'cycling' | 'running', range: 'all' | 'year' | '28d' = 'all') {
  return useQuery<HRCurveResponse>({
    queryKey: analyticsKeys.hrCurve(sport, range),
    queryFn: () => analyticsService.getHRCurve(sport, range),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useHRZones(sport: 'cycling' | 'running') {
  return useQuery<HRZonesResponse>({
    queryKey: analyticsKeys.hrZones(sport),
    queryFn: () => analyticsService.getHRZones(sport),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useHRThresholdHistory(sport: 'cycling' | 'running', days: number = 365) {
  return useQuery<HRThresholdHistoryResponse>({
    queryKey: analyticsKeys.hrThresholdHistory(sport, days),
    queryFn: () => analyticsService.getHRThresholdHistory(sport, days),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useEFHistory(sport: 'cycling' | 'running', days: number = 365) {
  return useQuery<EFHistoryResponse>({
    queryKey: analyticsKeys.efHistory(sport, days),
    queryFn: () => analyticsService.getEFHistory(sport, days),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useMaxHR(sport: 'cycling' | 'running') {
  return useQuery<MaxHRResponse>({
    queryKey: analyticsKeys.maxHr(sport),
    queryFn: () => analyticsService.getMaxHR(sport),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useUpdateMaxHR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({sport, maxHeartRate}: {sport: 'cycling' | 'running'; maxHeartRate: number}) =>
      analyticsService.updateMaxHR(sport, maxHeartRate),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: analyticsKeys.all});
    },
  });
}

export function useHRZoneDistribution(sport: 'cycling' | 'running', days: number = 28) {
  return useQuery<HRZoneDistributionResponse>({
    queryKey: analyticsKeys.hrZoneDistribution(sport, days),
    queryFn: () => analyticsService.getHRZoneDistribution(sport, days),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
