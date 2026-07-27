export interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // in seconds
  token_type: string;
  scope: string;
}

export interface WhoopZoneDuration {
  zone_zero_milli?: number;
  zone_one_milli?: number;
  zone_two_milli?: number;
  zone_three_milli?: number;
  zone_four_milli?: number;
  zone_five_milli?: number;
}

export interface WhoopWorkoutScore {
  strain?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
  kilojoules?: number;
  percent_recorded?: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  altitude_change_meter?: number;
  zone_duration?: WhoopZoneDuration;
}

export interface WhoopWorkout {
  id: string; // UUID
  user_id: number | string;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: string; // "SCORED", "UNSCORED", "PENDING_SCORE"
  score?: WhoopWorkoutScore;
}

export interface WhoopPaginatedResponse<T> {
  records: T[];
  next_token?: string;
}

// Known WHOOP sport IDs
export const WHOOP_SPORTS: Record<number, string> = {
  0: 'Running',
  1: 'Cycling',
  16: 'Cross Country Skiing',
  33: 'Walking',
  42: 'HIIT',
  43: 'Spinning',
  44: 'Elliptical',
  45: 'Rowing',
  52: 'Obstacle Course Racing',
  70: 'Trail Running',
  71: 'Treadmill Running',
  77: 'Track and Field',
  91: 'Virtual Run',
};

// List of sport IDs considered "Running"
export const RUNNING_SPORT_IDS = new Set([0, 70, 71, 77, 91]);

export function isRunningSport(sportId: number): boolean {
  return RUNNING_SPORT_IDS.has(sportId);
}

export function getSportName(sportId: number): string {
  return WHOOP_SPORTS[sportId] || `Activity (ID: ${sportId})`;
}
