import axios, { AxiosResponse } from 'axios';
import { getDb } from '../db/index.js';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabase.js';
import { getValidAccessToken } from './auth.js';
import {
  WhoopPaginatedResponse,
  WhoopWorkout,
  getSportName,
  isRunningSport,
} from './types.js';

const WHOOP_WORKOUT_URL = 'https://api.prod.whoop.com/developer/v2/activity/workout';

export interface SyncResult {
  success: boolean;
  totalSynced: number;
  runningSynced: number;
  message?: string;
  storage: 'supabase' | 'sqlite' | 'both';
}

export async function syncWhoopWorkouts(userId: string = 'default_user'): Promise<SyncResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return {
      success: false,
      totalSynced: 0,
      runningSynced: 0,
      storage: isSupabaseConfigured() ? 'supabase' : 'sqlite',
      message: 'No valid access token available. Please authenticate via WHOOP OAuth.',
    };
  }

  const useSupabase = isSupabaseConfigured();
  const supabase = getSupabaseClient();
  let nextToken: string | undefined = undefined;
  let totalSynced = 0;
  let runningSynced = 0;

  try {
    do {
      const response: AxiosResponse<WhoopPaginatedResponse<WhoopWorkout>> = await axios.get(
        WHOOP_WORKOUT_URL,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            limit: 25,
            nextToken,
          },
        }
      );

      const records = response.data.records || [];
      nextToken = response.data.next_token;

      for (const workout of records) {
        const isRunning = isRunningSport(workout.sport_id) || (workout as any).sport_name === 'running';
        const rawSportName = (workout as any).sport_name;
        const sportName = rawSportName
          ? rawSportName.charAt(0).toUpperCase() + rawSportName.slice(1).replace(/-/g, ' ')
          : getSportName(workout.sport_id);

        const startTime = new Date(workout.start).getTime();
        const endTime = new Date(workout.end).getTime();
        const durationMs = endTime - startTime;

        const distMeter = workout.score?.distance_meter || null;
        const distMiles = distMeter ? distMeter / 1609.344 : null;
        const distKm = distMeter ? distMeter / 1000 : null;

        const kj = workout.score?.kilojoules || null;
        const calories = kj ? kj / 4.184 : null;

        const zd = workout.score?.zone_duration;

        const workoutPayload = {
          id: workout.id,
          user_id: String(workout.user_id),
          sport_id: workout.sport_id,
          sport_name: sportName,
          is_running: isRunning,
          score_state: workout.score_state || 'UNKNOWN',
          start_time: workout.start,
          end_time: workout.end,
          timezone_offset: workout.timezone_offset || null,
          duration_ms: durationMs,
          distance_meters: distMeter,
          distance_miles: distMiles,
          distance_km: distKm,
          kilojoules: kj,
          calories: calories,
          average_heart_rate: workout.score?.average_heart_rate || null,
          max_heart_rate: workout.score?.max_heart_rate || null,
          strain: workout.score?.strain || null,
          zone_zero_ms: zd?.zone_zero_milli || 0,
          zone_one_ms: zd?.zone_one_milli || 0,
          zone_two_ms: zd?.zone_two_milli || 0,
          zone_three_ms: zd?.zone_three_milli || 0,
          zone_four_ms: zd?.zone_four_milli || 0,
          zone_five_ms: zd?.zone_five_milli || 0,
          raw_json: workout,
          updated_at: new Date().toISOString(),
        };

        // 1. Save to Supabase if configured
        if (useSupabase && supabase) {
          try {
            await supabase.from('whoop_workouts').upsert(
              workoutPayload,
              { onConflict: 'id' }
            );
          } catch (err) {}
        }

        // 2. Save to local SQLite database
        try {
          const db = await getDb();
          await db.run(
            `INSERT INTO whoop_workouts (
              id, user_id, sport_id, sport_name, is_running, score_state,
              start_time, end_time, timezone_offset, duration_ms,
              distance_meters, distance_miles, distance_km, kilojoules, calories,
              average_heart_rate, max_heart_rate, strain,
              zone_zero_ms, zone_one_ms, zone_two_ms, zone_three_ms, zone_four_ms, zone_five_ms,
              raw_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              user_id = excluded.user_id,
              sport_id = excluded.sport_id,
              sport_name = excluded.sport_name,
              is_running = excluded.is_running,
              score_state = excluded.score_state,
              start_time = excluded.start_time,
              end_time = excluded.end_time,
              timezone_offset = excluded.timezone_offset,
              duration_ms = excluded.duration_ms,
              distance_meters = excluded.distance_meters,
              distance_miles = excluded.distance_miles,
              distance_km = excluded.distance_km,
              kilojoules = excluded.kilojoules,
              calories = excluded.calories,
              average_heart_rate = excluded.average_heart_rate,
              max_heart_rate = excluded.max_heart_rate,
              strain = excluded.strain,
              zone_zero_ms = excluded.zone_zero_ms,
              zone_one_ms = excluded.zone_one_ms,
              zone_two_ms = excluded.zone_two_ms,
              zone_three_ms = excluded.zone_three_ms,
              zone_four_ms = excluded.zone_four_ms,
              zone_five_ms = excluded.zone_five_ms,
              raw_json = excluded.raw_json,
              updated_at = CURRENT_TIMESTAMP;`,
            [
              workout.id,
              String(workout.user_id),
              workout.sport_id,
              sportName,
              isRunning ? 1 : 0,
              workout.score_state || 'UNKNOWN',
              workout.start,
              workout.end,
              workout.timezone_offset || null,
              durationMs,
              distMeter,
              distMiles,
              distKm,
              kj,
              calories,
              workout.score?.average_heart_rate || null,
              workout.score?.max_heart_rate || null,
              workout.score?.strain || null,
              zd?.zone_zero_milli || 0,
              zd?.zone_one_milli || 0,
              zd?.zone_two_milli || 0,
              zd?.zone_three_milli || 0,
              zd?.zone_four_milli || 0,
              zd?.zone_five_milli || 0,
              JSON.stringify(workout),
            ]
          );
        } catch (sqliteErr) {}

        totalSynced++;
        if (isRunning) {
          runningSynced++;
        }
      }
    } while (nextToken);

    // Save sync log
    if (useSupabase && supabase) {
      try {
        await supabase.from('sync_logs').insert({
          sync_type: 'workouts',
          status: 'SUCCESS',
          items_synced: totalSynced,
          running_synced: runningSynced,
        });
      } catch (err) {}
    }

    try {
      const db = await getDb();
      await db.run(
        `INSERT INTO sync_logs (sync_type, status, items_synced, running_synced)
         VALUES (?, ?, ?, ?);`,
        ['workouts', 'SUCCESS', totalSynced, runningSynced]
      );
    } catch (err) {}

    return {
      success: true,
      totalSynced,
      runningSynced,
      storage: useSupabase ? 'supabase' : 'sqlite',
      message: `Successfully synced ${totalSynced} workouts (${runningSynced} running activities).`,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error('Error during WHOOP sync:', errorMsg);

    return {
      success: false,
      totalSynced,
      runningSynced,
      storage: useSupabase ? 'supabase' : 'sqlite',
      message: `Sync failed: ${errorMsg}`,
    };
  }
}
