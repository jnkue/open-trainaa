import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { createSupabaseStorage } from '../lib/supabase-storage';

// Environment variables - these should be set in your .env file
const ENVIRONMENT = process.env.EXPO_PUBLIC_ENVIRONMENT;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

// Validate environment variables
console.log('Loading environment variables:', {
  ENVIRONMENT: ENVIRONMENT || 'Missing',
  SUPABASE_URL: SUPABASE_URL || 'Missing',
  SUPABASE_URL_length: SUPABASE_URL?.length,
  SUPABASE_KEY: SUPABASE_KEY ? 'Set' : 'Missing',
  BACKEND_BASE_URL: BACKEND_BASE_URL || 'Missing'
});


// API Response types
export interface Activity {
  id: string;
  provider_activity_id: string;
  name: string;
  activity_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  duration: number;
  total_timer_time?: number;
  total_elapsed_time?: number;
  elevation_gain: number;
  calories?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  max_speed?: number;
  average_power?: number;
  max_power?: number;
  description?: string;
  /** @deprecated Use external_id with upload_source instead */
  strava_activity_id?: number;
  external_id?: string | null;
  manufacturer?: string | null;
  product?: string | null;
  device_name?: string | null;
  upload_source?: string;
}

export interface ActivitiesResponse {
  items: Activity[];
  total: number;
  page: number;
  perPage: number;
}

export interface VersionCheckResponse {
  version: string;
  is_supported: boolean;
  latest_version: string;
  message: string;
}

export interface SessionCustomData {
  title?: string;
  heart_rate_load?: number;
  llm_feedback?: string;
  feel?: number; // 0=Very Weak, 25=Weak, 50=Normal, 75=Strong, 100=Very Strong
  rpe?: number; // Rate of Perceived Exertion (0-100)
}

export interface Session {
  id: string;
  activity_id: string;
  session_custom_data?: SessionCustomData;
  session_number: number;
  sport: string;
  sub_sport?: string;
  start_time: string;
  distance?: number;
  duration?: number;
  total_timer_time?: number;
  total_elapsed_time?: number;
  calories?: number;
  elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  max_speed?: number;
  average_cadence?: number;
}

export interface SessionsResponse {
  items: Session[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ActivityDetail extends Activity {
  location_city?: string;
  raw_data?: any;
  gps_data?: any;
  laps?: any[];
}

export interface ActivityStreams {
  activity_id: string;
  activity_name: string;
  streams: Record<string, { data: number[] }>;
  available_stream_types: string[];
  has_streams: boolean;
}

export interface ActivityRecord {
  id: string;
  activity_id: string;
  session_id?: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  distance?: number;
  heart_rate?: number;
  cadence?: number;
  speed?: number;
  power?: number;
  temperature?: number;
}

// Calendar-specific types
export interface CalendarSession {
  id: string;
  activity_id: string;
  sport: string;
  sub_sport?: string;
  start_time: string;
  duration?: number;
  distance?: number;
  calories?: number;
  elevation_gain?: number;
  average_heartrate?: number;
  average_speed?: number;
  total_timer_time?: number;
  total_elapsed_time?: number;
  total_distance?: number;
  avg_heart_rate?: number;
  total_calories?: number;
}

export interface CalendarDayData {
  date: string; // ISO date string (YYYY-MM-DD)
  sessions: CalendarSession[];
  totalSessions: number;
  totalDuration: number;
  totalDistance: number;
  totalCalories: number;
  sports: string[];
}

export interface SessionsByDate {
  [dateKey: string]: CalendarSession[];
}

export interface SessionStats {
  totalSessions: number;
  totalDuration: number;
  totalDistance: number;
  totalCalories: number;
  sportBreakdown: {
    [sport: string]: {
      count: number;
      duration: number;
      distance: number;
      calories: number;
    };
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export interface SessionsDateRangeResponse {
  sessions: CalendarSession[];
  total: number;
  stats: SessionStats;
  sessionsByDate: SessionsByDate;
}

// Chat API types
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ThreadInfo {
  thread_id: string;
  trainer: string;
  created_at: string;
}

export interface ThreadMessagesResponse {
  thread_id: string;
  messages: ChatMessage[];
  total_messages: number;
}

export interface CreateThreadRequest {
  trainer?: string;
}

export interface CreateThreadResponse {
  thread_id: string;
  trainer: string;
  created_at: string;
}

export interface StravaStatus {
  success: boolean;
  data?: {
    connected: boolean;
    athlete_id?: string;
    expires_at?: string;
    is_expired?: boolean;
    scope?: string;
    has_activity_write?: boolean;
    athlete_data?: any;
  };
}

export interface WahooStatus {
  success: boolean;
  data?: {
    connected: boolean;
    athlete_id?: string;
    expires_at?: string;
    is_expired?: boolean;
    upload_workouts_enabled?: boolean;
    download_activities_enabled?: boolean;
    has_workouts_write?: boolean;
    has_plans_write?: boolean;
    has_workouts_read?: boolean;
    needs_reauth?: boolean;
  };
}

export interface GarminStatus {
  success: boolean;
  data?: {
    connected: boolean;
    athlete_id?: string;
    expires_at?: string;
    is_expired?: boolean;
    scope?: string;
    upload_workouts_enabled?: boolean;
    download_activities_enabled?: boolean;
    permissions?: string[];
    has_workout_import_permission?: boolean;
    has_activity_export_permission?: boolean;
  };
}

export interface SyncResponse {
  success: boolean;
  message: string;
  activities_found: number;
  new_activities: number;
  activity_ids: string[];
  debug_logs: string[];
}

// User Feedback types
export interface UserSessionFeedback {
  id: string;
  user_id: string;
  session_id: string;
  feel?: number; // 0=Very Weak, 25=Weak, 50=Normal, 75=Strong, 100=Very Strong
  rpe?: number; // Rate of Perceived Exertion (0-100)
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateUserFeedback {
  feel?: number; // 0, 25, 50, 75, 100
  rpe?: number; // 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
}

export interface UpdateUserFeedback {
  feel?: number; // 0, 25, 50, 75, 100
  rpe?: number; // 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
}

// Invitation Code types
export interface InvitationCodeValidationResponse {
  valid: boolean;
  message: string;
}

export interface InvitationCodeClaimRequest {
  code: string;
}

export interface InvitationCodeClaimResponse {
  success: boolean;
  message: string;
}

// API Client class
export class ApiClient {
  public supabase: SupabaseClient;
  private backendUrl: string;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: createSupabaseStorage(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web', // Enable URL detection on web, use deep links on mobile
      },
    });
    this.backendUrl = BACKEND_BASE_URL;
  }

  // Getter for backend URL
  get BASE_URL(): string {
    return this.backendUrl;
  }

  // Authentication methods
  async signUp(email: string, password: string) {
    return await this.supabase.auth.signUp({ email, password });
  }

  async signIn(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({ email, password });
  }

  async signInWithGoogle() {
    if (Platform.OS === 'web') {
      return await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
    }

    const { GoogleSignin, statusCodes } = await import('@react-native-google-signin/google-signin');

    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      offlineAccess: true,
    });

    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken;

      if (!idToken) {
        throw new Error('Google sign-in failed: no ID token received');
      }

      return await this.supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw { code: 'CANCELLED', message: 'Google sign-in was cancelled' };
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        throw { code: 'IN_PROGRESS', message: 'Google sign-in is already in progress' };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw { code: 'PLAY_SERVICES_UNAVAILABLE', message: 'Google Play Services is not available' };
      }
      throw error;
    }
  }

  async signInWithApple() {
    if (Platform.OS === 'web') {
      return await this.supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
    }

    const AppleAuthentication = await import('expo-apple-authentication');

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw { code: 'UNAVAILABLE', message: 'Apple Sign-In is not available on this device' };
    }

    const { randomUUID, digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
    const rawNonce = randomUUID();
    const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const idToken = credential.identityToken;
      if (!idToken) {
        throw new Error('Apple sign-in failed: no identity token received');
      }

      const result = await this.supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: idToken,
        nonce: rawNonce,
      });

      // Apple only provides the full name on the first sign-in
      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ');
        if (fullName) {
          await this.supabase.auth.updateUser({
            data: { full_name: fullName },
          });
        }
      }

      return result;
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        throw { code: 'CANCELLED', message: 'Apple sign-in was cancelled' };
      }
      throw error;
    }
  }

  async signOut() {
    // Sign out with scope: 'local' to only clear local session
    // This prevents errors when the session is already expired on the server
    return await this.supabase.auth.signOut({ scope: 'local' });
  }

  async getCurrentUser() {
    return await this.supabase.auth.getUser();
  }

  async getSession() {
    return await this.supabase.auth.getSession();
  }

  async resetPassword(email: string) {
    // For mobile apps, use Expo deep link. For web, use window.location.origin
    const redirectTo = Platform.OS === 'web'
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`
      : Linking.createURL('reset-password');

    return await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
  }

  async updatePassword(newPassword: string) {
    return await this.supabase.auth.updateUser({
      password: newPassword,
    });
  }

  // Invitation Code methods
  async validateInvitationCode(code: string): Promise<InvitationCodeValidationResponse> {
    try {
      const response = await fetch(
        `${this.backendUrl}/v1/invitation-codes/validate/${encodeURIComponent(code.trim())}`
      );

      if (!response.ok) {
        throw new Error('Failed to validate invitation code');
      }

      return await response.json();
    } catch (error) {
      console.error('Error validating invitation code:', error);
      throw error;
    }
  }

  async claimInvitationCode(code: string): Promise<InvitationCodeClaimResponse> {
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required to claim invitation code');
    }

    try {
      const response = await fetch(
        `${this.backendUrl}/v1/invitation-codes/claim`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ code: code.trim() }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to claim invitation code: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error claiming invitation code:', error);
      throw error;
    }
  }

  // Get JWT token for API calls
  private async getAuthToken(): Promise<string | null> {
    const session = await this.getSession();
    const token = session.data.session?.access_token || null;

    if (!token) {
      console.warn('No authentication token available. User may need to sign in.');
    }

    return token;
  }

  // Generic API call method
  private async apiCall<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken();
    console.log('API Call:', endpoint, 'Token:', token ? 'Present' : 'Missing');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.backendUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  }

  // Activities API methods
  async getActivities(page: number = 1, perPage: number = 20): Promise<ActivitiesResponse> {
    return this.apiCall<ActivitiesResponse>(
      `/v1/activities/list?page=${page}&per_page=${perPage}`
    );
  }

  async getSessions(page: number = 1, perPage: number = 20, sport?: string): Promise<SessionsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    
    if (sport) {
      params.append('sport', sport);
    }
    
    return this.apiCall<SessionsResponse>(
      `/v1/activities/sessions?${params.toString()}`
    );
  }

  // IMPORTANT: getActivityDetail is deprecated - use getSessionDetail instead
  // This is kept for backward compatibility but will fetch session data
  async getActivityDetail(activityId: string): Promise<ActivityDetail> {
    return this.apiCall<ActivityDetail>(
      `/v1/activities/${activityId}/detail`
    );
  }

  /**
   * Get details for a specific training session
   *
   * IMPORTANT: This fetches SESSION data, not activity data!
   * - sessions: Individual training sessions (e.g., one run, one bike ride)
   * - activities: Container for sessions (e.g., a triathlon FIT file)
   *
   * Use this when displaying session details in the detail view.
   */
  async getSessionDetail(sessionId: string): Promise<{session: any}> {
    return this.apiCall<{session: any}>(
      `/v1/activities/sessions/${sessionId}`
    );
  }

  async getActivityStreams(activityId: string): Promise<ActivityStreams> {
    return this.apiCall<ActivityStreams>(
      `/v1/activities/${activityId}/streams`
    );
  }

  // IMPORTANT: getActivityRecords is deprecated - use getSessionRecords instead
  async getActivityRecords(activityId: string, limit: number = 100): Promise<{records: ActivityRecord[], total: number}> {
    return this.apiCall<{records: ActivityRecord[], total: number}>(
      `/v1/activities/${activityId}/records?limit=${limit}`
    );
  }

  /**
   * Get time-series records for a specific training session
   *
   * IMPORTANT: Records are linked to SESSIONS, not activities!
   * Returns GPS coordinates, heart rate, power, speed, etc. for one session.
   */
  async getSessionRecords(sessionId: string, limit: number = 1000): Promise<{records: ActivityRecord[], total: number}> {
    return this.apiCall<{records: ActivityRecord[], total: number}>(
      `/v1/activities/sessions/${sessionId}/records?limit=${limit}`
    );
  }

  /**
   * Get complete session data in a single optimized request
   *
   * This endpoint combines multiple data sources:
   * - Session detail (metrics, start time, etc.)
   * - Trainer feedback (llm_feedback from session)
   * - User feedback (from user_session_feedback table)
   * - Session records (optional, GPS/HR/power time-series data)
   *
   * This reduces 3-4 separate API calls to just 1, significantly improving page load speed.
   *
   * @param sessionId - The session UUID
   * @param includeRecords - Whether to include time-series records (default: true)
   */
  async getSessionComplete(sessionId: string, includeRecords: boolean = true): Promise<{
    session: any;
    trainer_feedback: string | null;
    user_feedback: UserSessionFeedback | null;
    records: any;
  }> {
    return this.apiCall<{
      session: any;
      trainer_feedback: string | null;
      user_feedback: UserSessionFeedback | null;
      records: any;
    }>(
      `/v1/activities/sessions/${sessionId}/complete?include_records=${includeRecords}`
    );
  }


  async deleteActivity(activityId: string): Promise<{ detail: string }> {
    return this.apiCall<{ detail: string }>(
      `/v1/activities/${activityId}`,
      { method: 'DELETE' }
    );
  }

  async reprocessActivity(activityId: string): Promise<{ detail: string }> {
    return this.apiCall<{ detail: string }>(
      `/v1/activities/${activityId}/reprocess`,
      { method: 'POST' }
    );
  }

  async reprocessSession(sessionId: string): Promise<{ detail: string; session_id: string }> {
    return this.apiCall<{ detail: string; session_id: string }>(
      `/v1/activities/sessions/${sessionId}/reprocess`,
      { method: 'POST' }
    );
  }

  // Calendar-specific session methods
  async getSessionsByDateRange(
    startDate: string,
    endDate: string,
    sport?: string
  ): Promise<SessionsDateRangeResponse> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    if (sport) {
      params.append('sport', sport);
    }

    return this.apiCall<SessionsDateRangeResponse>(
      `/v1/activities/sessions/date-range?${params.toString()}`
    );
  }

  async getSessionsByDate(date: string, sport?: string): Promise<CalendarDayData> {
    const params = new URLSearchParams({
      date: date,
    });

    if (sport) {
      params.append('sport', sport);
    }

    return this.apiCall<CalendarDayData>(
      `/v1/activities/sessions/by-date?${params.toString()}`
    );
  }

  async getSessionsForCalendar(year: number, month: number): Promise<SessionsByDate> {
    const params = new URLSearchParams({
      year: year.toString(),
      month: month.toString(),
    });

    return this.apiCall<SessionsByDate>(
      `/v1/activities/sessions/calendar?${params.toString()}`
    );
  }

  async getSessionStats(startDate: string, endDate: string, sport?: string): Promise<SessionStats> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    if (sport) {
      params.append('sport', sport);
    }

    return this.apiCall<SessionStats>(
      `/v1/activities/sessions/stats?${params.toString()}`
    );
  }

  async getSessionSummary(date: string): Promise<CalendarDayData> {
    return this.apiCall<CalendarDayData>(
      `/v1/activities/sessions/summary?date=${date}`
    );
  }

  // Helper method to format sessions data for calendar display
  private formatSessionsForCalendar(sessions: Session[]): CalendarSession[] {
    return sessions.map(session => ({
      id: session.id,
      activity_id: session.activity_id,
      sport: session.sport,
      sub_sport: session.sub_sport,
      start_time: session.start_time,
      duration: session.duration,
      distance: session.distance,
      calories: session.calories,
      elevation_gain: session.elevation_gain,
      average_heartrate: session.average_heartrate,
      average_speed: session.average_speed,
      total_timer_time: session.total_timer_time,
      total_elapsed_time: session.total_elapsed_time || session.duration,
      total_distance: session.distance,
      avg_heart_rate: session.average_heartrate,
      total_calories: session.calories,
    }));
  }

  // Fallback method using existing getSessions API with date filtering
  async getSessionsByDateRangeFallback(
    startDate: string,
    endDate: string,
    sport?: string
  ): Promise<SessionsDateRangeResponse> {
    try {
      console.log('getSessionsByDateRangeFallback called with:', { startDate, endDate, sport });

      // Try multiple pages to get all sessions in the date range
      let allSessions: Session[] = [];
      let page = 1;
      const perPage = 50;
      let hasMore = true;

      while (hasMore && page <= 10) { // Limit to 10 pages to prevent infinite loops
        console.log(`Fetching page ${page} of sessions...`);
        const response = await this.getSessions(page, perPage, sport);
        console.log(`Page ${page} returned ${response.items.length} sessions`);

        const filteredSessions = response.items.filter(session => {
          const sessionDate = session.start_time.split('T')[0];
          const matches = sessionDate >= startDate && sessionDate <= endDate;
          if (matches) {
            console.log(`Session matches date filter: ${sessionDate}`, session);
          }
          return matches;
        });

        console.log(`Page ${page} has ${filteredSessions.length} sessions in date range`);
        allSessions = [...allSessions, ...filteredSessions];

        // If we got fewer sessions than requested, we've reached the end
        if (response.items.length < perPage) {
          hasMore = false;
        } else {
          page++;
        }
      }

      console.log(`Total sessions found for date range: ${allSessions.length}`);


      // Convert to calendar sessions
      const calendarSessions = this.formatSessionsForCalendar(allSessions);

      // Group by date
      const sessionsByDate: SessionsByDate = {};
      calendarSessions.forEach(session => {
        const dateKey = session.start_time.split('T')[0];
        if (!sessionsByDate[dateKey]) {
          sessionsByDate[dateKey] = [];
        }
        sessionsByDate[dateKey].push(session);
      });

      // Calculate stats
      const stats: SessionStats = {
        totalSessions: calendarSessions.length,
        totalDuration: calendarSessions.reduce((sum, s) => sum + (s.duration || 0), 0),
        totalDistance: calendarSessions.reduce((sum, s) => sum + (s.distance || 0), 0),
        totalCalories: calendarSessions.reduce((sum, s) => sum + (s.calories || 0), 0),
        sportBreakdown: {},
        dateRange: { startDate, endDate }
      };

      // Calculate sport breakdown
      calendarSessions.forEach(session => {
        const sport = session.sport;
        if (!stats.sportBreakdown[sport]) {
          stats.sportBreakdown[sport] = {
            count: 0,
            duration: 0,
            distance: 0,
            calories: 0
          };
        }
        stats.sportBreakdown[sport].count++;
        stats.sportBreakdown[sport].duration += session.duration || 0;
        stats.sportBreakdown[sport].distance += session.distance || 0;
        stats.sportBreakdown[sport].calories += session.calories || 0;
      });

      return {
        sessions: calendarSessions,
        total: calendarSessions.length,
        stats,
        sessionsByDate
      };
    } catch (error) {
      console.error('Error in getSessionsByDateRangeFallback:', error);
      throw error;
    }
  }

  async uploadFitFile(file: File): Promise<any> {
    const token = await this.getAuthToken();
    console.log('FIT Upload:', file.name, 'Size:', file.size, 'Token:', token ? 'Present' : 'Missing');

    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't set Content-Type for FormData - let the browser set it with boundary

    const response = await fetch(`${this.backendUrl}/v1/activities/upload-fit`, {
      method: 'POST',
      headers,
      body: formData,
    });

    console.log('FIT Upload Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('FIT Upload Error:', response.status, errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('FIT Upload Result:', result);
    return result;
  }

  async uploadActivityJson(payload: {
    upload_source: string;
    external_id: string;
    sport: string;
    sub_sport?: string;
    start_time: string;
    total_distance?: number;
    total_elapsed_time?: number;
    total_timer_time?: number;
    total_calories?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    avg_speed?: number;
    max_speed?: number;
    avg_cadence?: number;
    total_elevation_gain?: number;
    records?: {
      timestamp: number[];
      heart_rate?: (number | null)[];
      latitude?: (number | null)[];
      longitude?: (number | null)[];
      altitude?: (number | null)[];
      speed?: (number | null)[];
      distance?: (number | null)[];
      cadence?: (number | null)[];
      power?: (number | null)[];
      temperature?: (number | null)[];
    };
  }): Promise<{ detail: string; activity_id: string; session_id?: string; is_duplicate: boolean }> {
    return this.apiCall('/v1/activities/upload-json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Strava integration methods
  async getStravaAuthUrl(redirectUri?: string): Promise<{ authorization_url?: string; authorize_url?: string }> {
    const endpoint = redirectUri
      ? `/v1/strava/auth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`
      : '/v1/strava/auth/authorize';

    return this.apiCall<{ authorization_url?: string; authorize_url?: string }>(
      endpoint
    );
  }

  async getStravaStatus(): Promise<StravaStatus> {
    // Backend returns { connected: boolean, athlete_id?, expires_at?, ... }
    // Normalize to the app's StravaStatus shape: { success: boolean, data?: any }
    try {
      const res = await this.apiCall<any>('/v1/strava/auth/status');
      if (res && res.connected) {
        return { success: true, data: res };
      }
      return { success: false };
    } catch (err) {
      // Propagate error to caller
      throw err;
    }
  }

  async disconnectStrava(): Promise<{ success: boolean }> {
    return this.apiCall<{ success: boolean }>(
      '/v1/strava/auth/disconnect',
      { method: 'DELETE' }
    );
  }

  // Wahoo integration methods
  async getWahooAuthUrl(redirectUri?: string): Promise<{ authorization_url?: string; authorize_url?: string }> {
    const endpoint = redirectUri
      ? `/v1/wahoo/auth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`
      : '/v1/wahoo/auth/authorize';

    return this.apiCall<{ authorization_url?: string; authorize_url?: string }>(
      endpoint
    );
  }

  async getWahooStatus(): Promise<WahooStatus> {
    try {
      const res = await this.apiCall<any>('/v1/wahoo/auth/status');
      if (res && res.connected) {
        return { success: true, data: res };
      }
      return { success: false };
    } catch (err) {
      throw err;
    }
  }

  async disconnectWahoo(): Promise<{ success: boolean }> {
    return this.apiCall<{ success: boolean }>(
      '/v1/wahoo/auth/disconnect',
      { method: 'DELETE' }
    );
  }

  async updateWahooSettings(settings: {
    upload_workouts_enabled: boolean;
    download_activities_enabled: boolean;
  }): Promise<any> {
    return this.apiCall<any>(
      `/v1/wahoo/auth/settings?upload_workouts_enabled=${settings.upload_workouts_enabled}&download_activities_enabled=${settings.download_activities_enabled}`,
      { method: 'PUT' }
    );
  }

  async syncWahooActivities(days: number = 7): Promise<SyncResponse> {
    return this.apiCall<SyncResponse>(
      `/v1/wahoo/api/activities/sync?days=${days}`,
      { method: 'POST' }
    );
  }

  async uploadWorkoutToWahoo(workout: {
    workout_name: string;
    workout_description?: string;
    workout_steps: any[];
  }): Promise<any> {
    return this.apiCall<any>(
      '/v1/wahoo/api/workouts/upload',
      {
        method: 'POST',
        body: JSON.stringify(workout),
      }
    );
  }

  async syncWahooWorkouts(): Promise<{
    success: boolean;
    message: string;
    operations_processed: number;
    succeeded: number;
    failed: number;
    details: any;
  }> {
    return this.apiCall<any>(
      '/v1/wahoo/api/sync/user',
      { method: 'POST' }
    );
  }

  // Garmin integration methods
  async getGarminAuthUrl(redirectUri?: string): Promise<{ authorization_url?: string; authorize_url?: string }> {
    const endpoint = redirectUri
      ? `/v1/garmin/auth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`
      : '/v1/garmin/auth/authorize';

    return this.apiCall<{ authorization_url?: string; authorize_url?: string }>(
      endpoint
    );
  }

  async getGarminStatus(): Promise<GarminStatus> {
    try {
      const res = await this.apiCall<any>('/v1/garmin/auth/status');
      if (res && res.connected) {
        return { success: true, data: res };
      }
      return { success: false };
    } catch (err) {
      throw err;
    }
  }

  async disconnectGarmin(): Promise<{ success: boolean }> {
    return this.apiCall<{ success: boolean }>(
      '/v1/garmin/auth/disconnect',
      { method: 'DELETE' }
    );
  }

  async updateGarminSettings(settings: {
    upload_workouts_enabled: boolean;
    download_activities_enabled: boolean;
  }): Promise<any> {
    return this.apiCall<any>(
      `/v1/garmin/auth/settings?upload_workouts_enabled=${settings.upload_workouts_enabled}&download_activities_enabled=${settings.download_activities_enabled}`,
      { method: 'PUT' }
    );
  }

  async syncGarminActivities(days: number = 7): Promise<SyncResponse> {
    return this.apiCall<SyncResponse>(
      `/v1/garmin/api/activities/sync?days=${days}`,
      { method: 'POST' }
    );
  }

  async syncGarminWorkouts(): Promise<{
    success: boolean;
    message: string;
    workouts_synced: number;
    scheduled_synced: number;
    failed: number;
    details: any;
  }> {
    return this.apiCall<any>(
      '/v1/garmin/api/sync/user',
      { method: 'POST' }
    );
  }

  // Token storage utilities - simplified version without SecureStore for now
  static async storeAuthToken(token: string): Promise<void> {
    try {
      // For now, we'll just store in memory or rely on Supabase's built-in storage
      console.log('Token stored (simplified)');
    } catch (error) {
      console.error('Error storing auth token:', error);
    }
  }

  static async getStoredAuthToken(): Promise<string | null> {
    // For now, we'll get the token from the current session
    return null;
  }

  static async removeStoredAuthToken(): Promise<void> {
    try {
      console.log('Token removed (simplified)');
    } catch (error) {
      console.error('Error removing auth token:', error);
    }
  }

  // Generic GET method
  async get<T>(endpoint: string): Promise<T> {
    return this.apiCall<T>(endpoint, { method: 'GET' });
  }

  // Generic POST method
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.apiCall<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Generic PUT method
  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.apiCall<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Generic DELETE method
  async delete<T>(endpoint: string): Promise<T> {
    return this.apiCall<T>(endpoint, { method: 'DELETE' });
  }

  // Chat API methods
  async getChatThreads(): Promise<ThreadInfo[]> {
    return this.apiCall<ThreadInfo[]>('/v1/chat/threads');
  }

  async getChatMessages(threadId: string): Promise<ThreadMessagesResponse> {
    return this.apiCall<ThreadMessagesResponse>(`/v1/chat/threads/${threadId}/messages`);
  }

  async createChatThread(request: CreateThreadRequest = {}): Promise<CreateThreadResponse> {
    return this.apiCall<CreateThreadResponse>('/v1/chat/threads', {
      method: 'POST',
      body: JSON.stringify({ trainer: request.trainer || 'Simon' })
    });
  }

  async deleteChatThread(threadId: string): Promise<{ success: boolean; message: string }> {
    return this.apiCall<{ success: boolean; message: string }>(`/v1/chat/threads/${threadId}`, {
      method: 'DELETE'
    });
  }

  // Version check API method
  async checkVersion(version: string): Promise<VersionCheckResponse> {
    return this.apiCall<VersionCheckResponse>(`/v1/versioncheck?version=${encodeURIComponent(version)}`);
  }

  // User Session Feedback API methods
  // These methods now use the new session_custom_data table via the backend API
  async getUserSessionFeedback(sessionId: string): Promise<UserSessionFeedback | null> {
    try {
      const response = await this.apiCall<{ session_id: string; feedback: UserSessionFeedback | null }>(
        `/activities/sessions/${sessionId}/feedback`
      );
      return response.feedback;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async saveUserSessionFeedback(sessionId: string, feedback: CreateUserFeedback): Promise<UserSessionFeedback> {
    // The backend API handles both create and update
    const response = await this.apiCall<{ detail: string; session_id: string; feedback: UserSessionFeedback }>(
      `/activities/sessions/${sessionId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify(feedback),
      }
    );
    return response.feedback;
  }

  async deleteUserSessionFeedback(sessionId: string): Promise<void> {
    await this.apiCall<{ detail: string; session_id: string }>(
      `/activities/sessions/${sessionId}/feedback`,
      {
        method: 'DELETE',
      }
    );
  }

  // Subscription management
  async cancelSubscription(): Promise<{ success: boolean; message: string; store: string }> {
    return await this.apiCall<{ success: boolean; message: string; store: string }>(
      `/subscriptions/cancel`,
      {
        method: 'POST',
      }
    );
  }

  // Stripe billing methods
  async createStripeCheckoutSession(successUrl?: string, cancelUrl?: string): Promise<{ url: string; session_id: string }> {
    return await this.apiCall<{ url: string; session_id: string }>(
      `/stripe/create-checkout-session`,
      {
        method: 'POST',
        body: JSON.stringify({
          success_url: successUrl,
          cancel_url: cancelUrl,
        }),
      }
    );
  }

  async createStripePortalSession(): Promise<{ url: string }> {
    return await this.apiCall<{ url: string }>(
      `/stripe/create-portal-session`,
      {
        method: 'POST',
      }
    );
  }

  async getSubscriptionStatus(): Promise<{ is_pro_subscriber: boolean; has_byok_key: boolean; customer_info: any | null; subscription_store: string | null }> {
    return await this.apiCall<{ is_pro_subscriber: boolean; has_byok_key: boolean; customer_info: any | null; subscription_store: string | null }>(
      `/subscriptions/status`
    );
  }
}

// Export singleton instance
export const apiClient = new ApiClient();