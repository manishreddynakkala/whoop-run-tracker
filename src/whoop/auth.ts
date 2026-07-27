import axios from 'axios';
import dotenv from 'dotenv';
import { getDb } from '../db/index.js';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabase.js';
import { WhoopTokenResponse } from './types.js';

dotenv.config();

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

export function getAuthorizationUrl(state: string = 'whoop_state', redirectUriOverride?: string): string {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = redirectUriOverride || process.env.WHOOP_REDIRECT_URI || 'http://localhost:3000/auth/callback';

  if (!clientId) {
    throw new Error('WHOOP_CLIENT_ID must be configured in environment variables.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read:workout read:recovery read:cycles read:profile',
    state,
  });

  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, redirectUriOverride?: string): Promise<WhoopTokenResponse> {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const redirectUri = redirectUriOverride || process.env.WHOOP_REDIRECT_URI || 'http://localhost:3000/auth/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing WHOOP client credentials in environment variables.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await axios.post<WhoopTokenResponse>(
    WHOOP_TOKEN_URL,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  await saveTokenToDb(response.data);
  return response.data;
}

export async function refreshAccessToken(refreshToken: string): Promise<WhoopTokenResponse> {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing WHOOP client credentials in environment variables.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'read:workout read:recovery read:cycles read:profile',
  });

  const response = await axios.post<WhoopTokenResponse>(
    WHOOP_TOKEN_URL,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  await saveTokenToDb(response.data);
  return response.data;
}

export async function saveTokenToDb(tokenData: WhoopTokenResponse, userId: string = 'default_user') {
  const expiresAt = Date.now() + tokenData.expires_in * 1000;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient()!;
    const { error } = await supabase.from('whoop_tokens').upsert(
      {
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        token_type: tokenData.token_type || 'bearer',
        scope: tokenData.scope || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('Error saving WHOOP token to Supabase:', error.message);
    }
  }

  // Also save to SQLite local DB as fallback/dev cache
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO whoop_tokens (user_id, access_token, refresh_token, expires_at, token_type, scope, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         token_type = excluded.token_type,
         scope = excluded.scope,
         updated_at = CURRENT_TIMESTAMP;`,
      [
        userId,
        tokenData.access_token,
        tokenData.refresh_token,
        expiresAt,
        tokenData.token_type || 'bearer',
        tokenData.scope || '',
      ]
    );
  } catch (err) {
    // Ignore SQLite file write errors on read-only serverless platforms like Vercel
  }
}

export async function getValidAccessToken(userId: string = 'default_user'): Promise<string | null> {
  let record: { access_token: string; refresh_token: string; expires_at: number } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient()!;
    const { data, error } = await supabase
      .from('whoop_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      record = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Number(data.expires_at),
      };
    }
  }

  // Fallback to SQLite if Supabase didn't return a record
  if (!record) {
    try {
      const db = await getDb();
      const row = await db.get('SELECT * FROM whoop_tokens WHERE user_id = ?', [userId]);
      if (row) {
        record = {
          access_token: row.access_token,
          refresh_token: row.refresh_token,
          expires_at: row.expires_at,
        };
      }
    } catch (err) {
      // Ignore SQLite errors on serverless
    }
  }

  if (!record) {
    return null;
  }

  // Check if token is expired (or expires within 5 minutes)
  const isExpired = Date.now() + 5 * 60 * 1000 >= record.expires_at;

  if (isExpired) {
    try {
      const newTokenData = await refreshAccessToken(record.refresh_token);
      return newTokenData.access_token;
    } catch (error) {
      console.error('Failed to refresh WHOOP token:', error);
      return null;
    }
  }

  return record.access_token;
}
